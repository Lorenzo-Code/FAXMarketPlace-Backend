const express = require("express");
const router = express.Router();
const { updateTask, getTaskById, createTask } = require("../models/taskModel");
const { sendHelpScoutReply } = require("../utils/helpscoutClient");
const { postSlackReply, postTicketToSlack } = require("../utils/slackClient");

// Reply to a ticket (resolve + notify)
router.post("/:id/reply", async (req, res) => {
  const taskId = parseInt(req.params.id);
  const { resolutionNote, responderName } = req.body;

  try {
    const task = await getTaskById(taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });

    await updateTask(taskId, {
      status: "resolved",
      resolvedBy: responderName,
      resolutionNote,
      resolvedAt: Date.now(),
    });

    await sendHelpScoutReply(task.ticketId, {
      message: resolutionNote,
      customerEmail: task.userEmail,
    });

    if (task.slackThreadTs) {
      await postSlackReply(task.slackThreadTs, `✅ Task #${taskId} resolved by ${responderName}\n📝 ${resolutionNote}`);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Reply error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Create new ticket and task
router.post("/create", async (req, res) => {
  try {
    const {
      ticketId,
      subject,
      email,
      body,
      tag = "general",
      assignedTo = "Support",
    } = req.body;

    const newTask = {
      id: Date.now(),
      text: `${tag.toUpperCase()} issue from ${email}`,
      ticketId,
      tag,
      userEmail: email,
      notes: body,
      assignedTo,
      status: "open",
      timestamp: Date.now(),
    };

    await createTask(newTask);

    const slackThreadTs = await postTicketToSlack({
      ticketId,
      email,
      subject,
      body,
      taskId: newTask.id,
    });

    await updateTask(newTask.id, { slackThreadTs });

    res.status(200).json({ success: true, taskId: newTask.id });
  } catch (err) {
    console.error("Ticket hook error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
