"use client";

import { useState, useEffect, useRef } from "react";
import {
  Bell,
  MessageCircle,
  ArrowLeft,
  Send,
  ChevronRight,
} from "lucide-react";
import { cn, formatRelativeTime, formatKoreanDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  getConversation,
  sendParentMessage,
  markNoticeAsRead,
} from "@/actions/parent";
import type {
  ParentNotice,
  MessageConversation,
  MessageItem,
} from "@/actions/parent";

type Tab = "notices" | "messages";
type View = "list" | "notice-detail" | "chat";

export function MessagesClient({
  notices: initialNotices,
  conversations: initialConversations,
  parentId,
}: {
  notices: ParentNotice[];
  conversations: MessageConversation[];
  parentId: string;
}) {
  const [tab, setTab] = useState<Tab>("notices");
  const [view, setView] = useState<View>("list");
  const [notices, setNotices] = useState(initialNotices);
  const [conversations] = useState(initialConversations);
  const [selectedNotice, setSelectedNotice] = useState<ParentNotice | null>(
    null
  );
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedStaffName, setSelectedStaffName] = useState("");
  const [chatMessages, setChatMessages] = useState<MessageItem[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function openNotice(notice: ParentNotice) {
    setSelectedNotice(notice);
    setView("notice-detail");
    if (!notice.isRead) {
      try {
        await markNoticeAsRead(notice.id);
        setNotices((prev) =>
          prev.map((n) => (n.id === notice.id ? { ...n, isRead: true } : n))
        );
      } catch {
        // ignore
      }
    }
  }

  async function openChat(staffId: string, staffName: string) {
    setSelectedStaffId(staffId);
    setSelectedStaffName(staffName);
    setView("chat");
    setChatLoading(true);
    try {
      const msgs = await getConversation(staffId);
      setChatMessages(msgs);
    } catch {
      setChatMessages([]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleSend() {
    if (!newMessage.trim() || !selectedStaffId || sending) return;

    setSending(true);
    try {
      await sendParentMessage(selectedStaffId, newMessage.trim());
      // Optimistically add message
      setChatMessages((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          content: newMessage.trim(),
          senderType: "PARENT",
          createdAt: new Date().toISOString(),
          isRead: false,
        },
      ]);
      setNewMessage("");
      inputRef.current?.focus();
    } catch {
      // Could show toast error here
    } finally {
      setSending(false);
    }
  }

  function goBack() {
    setView("list");
    setSelectedNotice(null);
    setSelectedStaffId(null);
  }

  // Chat view
  if (view === "chat" && selectedStaffId) {
    return (
      <div className="flex flex-col h-[calc(100vh-5rem)]">
        {/* Chat Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
          <button
            onClick={goBack}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="뒤로가기"
          >
            <ArrowLeft className="size-5 text-gray-600" />
          </button>
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {selectedStaffName} 선생님
            </p>
            <p className="text-[11px] text-gray-400">1:1 메시지</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
          {chatLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : chatMessages.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">
              메시지가 없습니다. 먼저 메시지를 보내보세요.
            </div>
          ) : (
            chatMessages.map((msg) => {
              const isMe = msg.senderType === "PARENT";
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    isMe ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5",
                      isMe
                        ? "bg-blue-500 text-white rounded-br-md"
                        : "bg-white text-gray-800 rounded-bl-md border border-gray-100"
                    )}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                    <p
                      className={cn(
                        "text-[10px] mt-1",
                        isMe ? "text-blue-200" : "text-gray-400"
                      )}
                    >
                      {formatRelativeTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 bg-white border-t border-gray-100 safe-bottom">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="메시지를 입력하세요"
              className="flex-1 h-11 px-4 text-sm bg-gray-100 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              aria-label="메시지 입력"
            />
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              size="icon"
              className="w-11 h-11 rounded-full gradient-primary flex-shrink-0"
              aria-label="메시지 보내기"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Notice detail view
  if (view === "notice-detail" && selectedNotice) {
    return (
      <div className="px-5 pt-4 pb-4">
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-sm text-gray-500 mb-4 min-h-[44px]"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="size-4" />
          목록으로
        </button>
        <article>
          <h1 className="text-lg font-bold text-gray-900 mb-2">
            {selectedNotice.title}
          </h1>
          <p className="text-xs text-gray-400 mb-6">
            {formatKoreanDate(selectedNotice.publishAt)}
          </p>
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {selectedNotice.content}
          </div>
        </article>
      </div>
    );
  }

  // List view
  const unreadNotices = notices.filter((n) => !n.isRead).length;
  const unreadMessages = conversations.reduce(
    (sum, c) => sum + c.unreadCount,
    0
  );

  return (
    <div className="px-5 pt-6 pb-4 space-y-5">
      {/* Header */}
      <h1 className="text-xl font-bold text-gray-900">소통</h1>

      {/* Tab Switcher */}
      <div className="flex gap-2 px-1 py-1 bg-gray-100 rounded-xl" role="tablist">
        <button
          onClick={() => setTab("notices")}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] flex items-center justify-center gap-1.5",
            tab === "notices"
              ? "bg-white text-blue-600 shadow-sm"
              : "text-gray-500"
          )}
          role="tab"
          aria-selected={tab === "notices"}
        >
          <Bell className="size-3.5" />
          공지사항
          {unreadNotices > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-4.5 h-4.5 flex items-center justify-center min-w-[18px] px-1">
              {unreadNotices}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("messages")}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] flex items-center justify-center gap-1.5",
            tab === "messages"
              ? "bg-white text-blue-600 shadow-sm"
              : "text-gray-500"
          )}
          role="tab"
          aria-selected={tab === "messages"}
        >
          <MessageCircle className="size-3.5" />
          강사 메시지
          {unreadMessages > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {unreadMessages}
            </span>
          )}
        </button>
      </div>

      {/* Notices Tab */}
      {tab === "notices" && (
        <div className="space-y-2">
          {notices.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              공지사항이 없습니다
            </div>
          ) : (
            notices.map((notice) => (
              <button
                key={notice.id}
                onClick={() => openNotice(notice)}
                className="flex items-center gap-3 w-full p-3.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-left min-h-[56px]"
              >
                <div
                  className={cn(
                    "flex-shrink-0 w-2 h-2 rounded-full",
                    notice.isRead ? "bg-gray-300" : "bg-blue-500"
                  )}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm truncate",
                      notice.isRead
                        ? "text-gray-600"
                        : "text-gray-800 font-medium"
                    )}
                  >
                    {notice.title}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {formatKoreanDate(notice.publishAt)}
                  </p>
                </div>
                <ChevronRight className="size-4 text-gray-300 flex-shrink-0" />
              </button>
            ))
          )}
        </div>
      )}

      {/* Messages Tab */}
      {tab === "messages" && (
        <div className="space-y-2">
          {conversations.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              메시지가 없습니다
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.staffId}
                onClick={() => openChat(conv.staffId, conv.staffName)}
                className="flex items-center gap-3 w-full p-3.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-left min-h-[56px]"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-semibold text-sm flex-shrink-0">
                  {conv.staffName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800">
                      {conv.staffName} 선생님
                    </p>
                    <span className="text-[10px] text-gray-400">
                      {formatRelativeTime(conv.lastAt)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {conv.lastMessage}
                  </p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5 flex-shrink-0">
                    {conv.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
