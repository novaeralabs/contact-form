import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { WebClient } from "@slack/web-api";

interface AppEnv extends Env {
  SLACK_TOKEN: string;
  SLACK_CHANNEL_ID: string;
}

const app = new Hono<{ Bindings: AppEnv }>();

// CORS middleware
app.use("/api/*", cors());

// Contact form validation schema
const contactSchema = z.object({
  name: z.string().min(1, "Full name is required"),
  email: z.string().min(1, "Email is required").email("Email is invalid"),
  message: z.string().min(1, "Message is required"),
});

type ContactForm = z.infer<typeof contactSchema>;

// Slack message format
function formatSlackMessage(data: ContactForm) {
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "💬 New Contact Form Submission",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Name:*\n${data.name}`,
          },
          {
            type: "mrkdwn",
            text: `*Email:*\n${data.email}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Message:*\n${data.message}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `📅 ${new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" })}`,
          },
        ],
      },
    ],
  };
}

// Health check endpoint
app.get("/api/", (c) => c.json({ status: "ok", service: "contact-form" }));

// Contact form endpoint
app.post("/api/contact", zValidator("json", contactSchema), async (c) => {
  const data = c.req.valid("json");

  // Check Slack credentials
  if (!c.env.SLACK_TOKEN || !c.env.SLACK_CHANNEL_ID) {
    console.error("SLACK_TOKEN or SLACK_CHANNEL_ID is not configured");
    return c.json({ success: false, error: "Server configuration error" }, 500);
  }

  try {
    const slack = new WebClient(c.env.SLACK_TOKEN);
    const message = formatSlackMessage(data);

    // Send message to Slack
    await slack.chat.postMessage({
      channel: c.env.SLACK_CHANNEL_ID,
      text: `New contact from ${data.name}`,
      blocks: message.blocks,
    });

    return c.json({
      success: true,
      message: "Your message has been sent successfully!",
    });
  } catch (error) {
    console.error("Error sending to Slack:", error);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

export default app;
