import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "./chat";

export const Route = createFileRoute("/chat_/$chatId")({
  head: () => ({
    meta: [
      { title: "Chat — PrismXGPT" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ChatPage,
});
