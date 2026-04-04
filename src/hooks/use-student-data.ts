"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getStudentDashboard, getStudentHeaderData, getStudentInbadi, getStudentHeatmap, getStudentBadges } from "@/actions/student-app";
import { getNotificationsData, getStudentEnrollments } from "@/actions/student-app-resources";
import { getLearnPageData } from "@/actions/learning-session";
import { getDailyQuests } from "@/actions/learning-gamification";

export function useHeaderData() {
  return useQuery({
    queryKey: ["student", "header"],
    queryFn: () => getStudentHeaderData(),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["student", "dashboard"],
    queryFn: () => getStudentDashboard(),
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useMyPage() {
  return useQuery({
    queryKey: ["student", "mypage"],
    queryFn: () => getStudentInbadi(),
    staleTime: 3 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["student", "notifications"],
    queryFn: () => getNotificationsData(),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useEnrollments() {
  return useQuery({
    queryKey: ["student", "enrollments"],
    queryFn: () => getStudentEnrollments(),
    staleTime: 5 * 60_000,
    enabled: false,
  });
}

export function useHeatmap() {
  return useQuery({
    queryKey: ["student", "heatmap"],
    queryFn: () => getStudentHeatmap(),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useBadges() {
  return useQuery({
    queryKey: ["student", "badges"],
    queryFn: () => getStudentBadges(),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useLearnPage() {
  return useQuery({
    queryKey: ["student", "learn"],
    queryFn: async () => {
      const [pageData, questData] = await Promise.all([
        getLearnPageData(),
        getDailyQuests(),
      ]);
      return { ...pageData, quests: questData };
    },
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData,
  });
}
