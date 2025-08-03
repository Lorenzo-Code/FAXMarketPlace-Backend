const express = require("express");
const router = express.Router();
const { updateTask, getTaskById, createTask } = require("../models/taskModel");
const { sendHelpScoutReply } = require("../utils/helpscoutClient");
const { postSlackReply, postTicketToSlack } = require("../utils/slackClient");

// 🎫 Reply to a ticket (resolve + notify customer + post to Slack)
router.post("/:id/reply", async (req, res) => {
  const taskId = parseInt(req.params.id);
  const { resolutionNote, responderName } = req.body;
  const userKey = req.user?.id || req.sessionID || "guest";

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
      await postSlackReply(
        task.slackThreadTs,
        `✅ Task #${taskId} resolved by ${responderName}\n📝 ${resolutionNote}`
      );
    }

    console.log(`📩 [${userKey}] Ticket #${taskId} resolved.`);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Ticket reply error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 🆕 Create a new ticket + backend task + Slack thread
router.post("/create", async (req, res) => {
  const {
    ticketId,
    subject,
    email,
    body,
    tag = "general",
    assignedTo = "Support",
  } = req.body;

  const userKey = req.user?.id || req.sessionID || "guest";

  try {
    const taskId = Date.now();

    const newTask = {
      id: taskId,
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
      taskId,
    });

    await updateTask(taskId, { slackThreadTs });

    console.log(`📨 [${userKey}] Created ticket task #${taskId} for ${email}`);
    res.status(200).json({ success: true, taskId });
  } catch (err) {
    console.error("❌ Ticket creation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
