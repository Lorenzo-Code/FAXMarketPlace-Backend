// utils/slackClient.js
const axios = require("axios");
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SUPPORT_CHANNEL_ID = process.env.SLACK_SUPPORT_CHANNEL_ID;

const headers = {
  Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
  "Content-Type": "application/json",
};

// 1. Post a new ticket (creates a thread)
exports.postTicketToSlack = async ({ ticketId, email, subject, body, taskId }) => {
  try {
    const result = await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel: SLACK_SUPPORT_CHANNEL_ID,
        text: `📩 *New Ticket #${ticketId}* from \`${email}\``,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Subject:* ${subject}\n*Message:* ${body}`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "🧾 View Task" },
                url: `https://admin.fractionax.io/tasks/${taskId}`,
              },
              {
                type: "button",
                text: { type: "plain_text", text: "📬 View Ticket" },
                url: `https://secure.helpscout.net/conversation/${ticketId}`,
              },
            ],
          },
        ],
      },
      { headers }
    );

    if (!result.data.ok) throw new Error(result.data.error);
    return result.data.ts; // Thread timestamp
  } catch (err) {
    console.error("Slack ticket post failed:", err.message);
    return null;
  }
};

// 2. Post a reply into an existing thread
exports.postSlackReply = async (thread_ts, message) => {
  try {
    const result = await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel: SLACK_SUPPORT_CHANNEL_ID,
        thread_ts,
        text: message,
      },
      { headers }
    );

    if (!result.data.ok) throw new Error(result.data.error);
  } catch (err) {
    console.error("Slack thread reply failed:", err.message);
  }
};
