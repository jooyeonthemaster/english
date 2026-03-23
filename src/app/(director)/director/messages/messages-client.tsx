"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getConversations,
  getConversation,
  sendMessage,
} from "@/actions/communication";
import { formatTime, formatRelativeTime, getInitials, truncate } from "@/lib/utils";
import {
  Search,
  Send,
  Paperclip,
  MessageSquare,
  User,
  ChevronLeft,
} from "lucide-react";

type Conversation = Awaited<ReturnType<typeof getConversations>>[number];
type ConversationDetail = Awaited<ReturnType<typeof getConversation>>;

interface MessagesClientProps {
  initialConversations: Conversation[];
}

export default function MessagesClient({ initialConversations }: MessagesClientProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [search, setSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSending, startSending] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);

  useEffect(() => {
    if (selectedId) {
      loadConversation(selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages]);

  function loadConversations() {
    startTransition(async () => {
      const data = await getConversations();
      setConversations(data);
    });
  }

  function loadConversation(partnerId: string) {
    startTransition(async () => {
      const data = await getConversation(partnerId);
      setDetail(data);
    });
  }

  function handleSelectConversation(partnerId: string) {
    setSelectedId(partnerId);
    setShowMobileChat(true);
  }

  function handleSend() {
    if (!messageText.trim() || !selectedId) return;

    const formData = new FormData();
    formData.set("content", messageText.trim());
    formData.set("receiverId", selectedId);
    formData.set("receiverType", "PARENT");

    startSending(async () => {
      try {
        await sendMessage(formData);
        setMessageText("");
        loadConversation(selectedId);
        loadConversations();
      } catch {
        // silent
      }
    });
  }

  const filteredConversations = search
    ? conversations.filter(
        (c) =>
          c.partnerName.includes(search) ||
          c.students.some((s) => s.name.includes(search))
      )
    : conversations;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">메시지</h1>
        <p className="text-muted-foreground text-sm mt-1">
          학부모와 1:1 메시지를 주고받습니다
        </p>
      </div>

      <div className="border rounded-lg overflow-hidden bg-background" style={{ height: "calc(100vh - 200px)" }}>
        <div className="flex h-full">
          {/* Left Panel - Conversation List */}
          <div
            className={`w-full md:w-[340px] border-r flex flex-col shrink-0 ${
              showMobileChat ? "hidden md:flex" : "flex"
            }`}
          >
            {/* Search */}
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="학부모 또는 학생 이름 검색..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>

            {/* Conversation Items */}
            <ScrollArea className="flex-1">
              {filteredConversations.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <MessageSquare className="size-10 mx-auto mb-2 opacity-30" />
                  대화가 없습니다
                </div>
              )}
              {filteredConversations.map((conv) => (
                <button
                  key={conv.partnerId}
                  onClick={() => handleSelectConversation(conv.partnerId)}
                  className={`w-full text-left p-3 border-b transition-colors hover:bg-muted/50 ${
                    selectedId === conv.partnerId
                      ? "bg-blue-50 border-l-2 border-l-blue-500"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="size-10 shrink-0">
                      <AvatarFallback className="bg-blue-100 text-blue-700 text-sm">
                        {getInitials(conv.partnerName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium text-sm truncate">
                          {conv.partnerName}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {formatRelativeTime(conv.lastMessageAt)}
                        </span>
                      </div>
                      {conv.students.length > 0 && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {conv.students.map((s) => s.name).join(", ")} 학부모
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground truncate">
                          {truncate(conv.lastMessage, 40)}
                        </p>
                        {conv.unreadCount > 0 && (
                          <Badge className="bg-blue-500 text-white text-[10px] h-5 min-w-5 justify-center shrink-0 ml-2">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </ScrollArea>
          </div>

          {/* Right Panel - Chat View */}
          <div
            className={`flex-1 flex flex-col ${
              showMobileChat ? "flex" : "hidden md:flex"
            }`}
          >
            {selectedId && detail ? (
              <>
                {/* Chat Header */}
                <div className="h-14 border-b flex items-center gap-3 px-4 shrink-0">
                  <button
                    className="md:hidden"
                    onClick={() => setShowMobileChat(false)}
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-blue-100 text-blue-700 text-xs">
                      {detail.partner
                        ? getInitials(detail.partner.name)
                        : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">
                      {detail.partner?.name || "알 수 없음"}
                    </p>
                    {detail.partner?.students &&
                      detail.partner.students.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {detail.partner.students
                            .map((s) => s.name)
                            .join(", ")}{" "}
                          학부모
                        </p>
                      )}
                  </div>
                </div>

                {/* Messages Area */}
                <ScrollArea className="flex-1 px-4 py-3">
                  <div className="space-y-3">
                    {detail.messages.map((msg) => {
                      const isMe = msg.senderType === "STAFF";
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                        >
                          <div className={`flex items-end gap-2 max-w-[75%] ${isMe ? "flex-row-reverse" : ""}`}>
                            {!isMe && (
                              <Avatar className="size-7 shrink-0">
                                <AvatarFallback className="bg-gray-200 text-gray-600 text-[10px]">
                                  <User className="size-3.5" />
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div>
                              <div
                                className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                  isMe
                                    ? "bg-blue-500 text-white rounded-br-md"
                                    : "bg-gray-100 text-gray-900 rounded-bl-md"
                                }`}
                              >
                                {msg.content}
                              </div>
                              <p
                                className={`text-[10px] text-muted-foreground mt-1 ${
                                  isMe ? "text-right" : "text-left"
                                }`}
                              >
                                {formatTime(msg.createdAt)}
                                {isMe && msg.isRead && (
                                  <span className="ml-1 text-blue-400">읽음</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <div className="border-t p-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground">
                      <Paperclip className="size-4" />
                    </Button>
                    <Input
                      placeholder="메시지를 입력하세요..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      className="flex-1 h-9"
                    />
                    <Button
                      size="icon-sm"
                      onClick={handleSend}
                      disabled={!messageText.trim() || isSending}
                      className="shrink-0"
                    >
                      <Send className="size-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              /* Empty State */
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="size-16 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium mb-1">대화를 선택하세요</p>
                  <p className="text-sm">
                    왼쪽 목록에서 대화를 선택하면 메시지를 확인할 수 있습니다
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
