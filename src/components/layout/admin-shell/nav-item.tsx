// @ts-nocheck
"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NavGroup } from "../nav-config";

type NavItemRecord = NavGroup["items"][number];

interface NavItemProps {
  item: NavItemRecord;
  active: boolean;
  collapsed: boolean;
  isOpen: boolean;
  effectivePath: string;
  routeMatches: (href: string, path: string) => boolean;
  onNavClick: (href: string, e: React.MouseEvent) => void;
  onToggleMenu: (href: string) => void;
  onSetOpenMenu: (href: string, open: boolean) => void;
}

export function NavItem({
  item,
  active,
  collapsed,
  isOpen,
  effectivePath,
  routeMatches,
  onNavClick,
  onToggleMenu,
  onSetOpenMenu,
}: NavItemProps) {
  const Icon = item.icon;
  const hasChildren = item.children && item.children.length > 0;
  const childActive =
    hasChildren &&
    item.children!.some((c) => routeMatches(c.href, effectivePath));

  // Parent button for items with children (expanded sidebar)
  if (hasChildren && !collapsed) {
    return (
      <li>
        <div
          className={cn(
            "group/item relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200 w-full h-[38px] px-3",
            active || childActive
              ? "text-blue-600"
              : "text-gray-400 hover:text-gray-700",
          )}
          style={
            active || childActive
              ? {
                  background: "rgba(59, 130, 246, 0.08)",
                  boxShadow: "0 1px 3px rgba(59, 130, 246, 0.06)",
                }
              : undefined
          }
        >
          {/* Clickable label area → navigates to page + opens submenu */}
          <Link
            href={item.href}
            onClick={(e) => {
              if (!isOpen) onSetOpenMenu(item.href, true);
              onNavClick(item.href, e);
            }}
            className="flex items-center gap-3 flex-1 min-w-0"
          >
            <Icon
              className={cn(
                "shrink-0 transition-colors duration-200 size-[17px]",
                active || childActive
                  ? "text-blue-500"
                  : "text-gray-350 group-hover/item:text-gray-500",
              )}
              strokeWidth={active || childActive ? 2 : 1.7}
            />
            <span className="truncate">{item.label}</span>
          </Link>
          {/* Toggle button → only toggles submenu */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu(item.href);
            }}
            className="p-1 -mr-1 rounded hover:bg-black/[0.04] transition-colors"
          >
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-200",
                active || childActive
                  ? "text-blue-400"
                  : "text-gray-300 group-hover/item:text-gray-400",
                isOpen ? "rotate-0" : "-rotate-90",
              )}
            />
          </button>
        </div>
        {/* Sub-menu */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            isOpen ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="ml-2 mr-1 mt-1 bg-gray-50/80 rounded-lg py-1.5 px-2 space-y-0.5">
            {item.children!.map((child, ci) => {
              const exactMatch = effectivePath === child.href;
              const prefixMatch =
                routeMatches(child.href, effectivePath) && !exactMatch;
              const siblingHasExactOrBetterMatch = item.children!.some(
                (other, oi) =>
                  oi !== ci &&
                  routeMatches(other.href, effectivePath) &&
                  other.href.length > child.href.length,
              );
              const childIsActive =
                exactMatch || (prefixMatch && !siblingHasExactOrBetterMatch);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={(e) => onNavClick(child.href, e)}
                  className={cn(
                    "block px-3 py-1.5 text-[12px] rounded-md transition-colors",
                    childIsActive
                      ? "text-blue-600 font-semibold bg-white shadow-sm"
                      : "text-gray-500 hover:text-blue-600 hover:font-medium hover:bg-white",
                  )}
                >
                  {child.label}
                </Link>
              );
            })}
          </div>
        </div>
      </li>
    );
  }

  // Regular link (no children, or collapsed mode)
  const isComingSoon = !!item.comingSoon;
  const linkContent = (
    <Link
      href={item.href}
      onClick={(e) => onNavClick(item.href, e)}
      className={cn(
        "group/item relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200",
        collapsed
          ? "justify-center h-10 w-10 mx-auto"
          : "h-[38px] px-3",
        isComingSoon
          ? active
            ? "text-sky-700"
            : "text-slate-500 hover:text-sky-700"
          : active
            ? "text-blue-600"
            : "text-gray-400 hover:text-gray-700",
      )}
      style={
        active && !isComingSoon
          ? {
              background: "rgba(59, 130, 246, 0.08)",
              boxShadow: "0 1px 3px rgba(59, 130, 246, 0.06)",
            }
          : active && isComingSoon
            ? {
                background: "rgba(56, 189, 248, 0.1)",
                boxShadow: "0 1px 3px rgba(56, 189, 248, 0.08)",
              }
            : undefined
      }
    >
      <Icon
        className={cn(
          "shrink-0 transition-colors duration-200",
          isComingSoon
            ? active
              ? "text-sky-500"
              : "text-slate-400 group-hover/item:text-sky-500"
            : active
              ? "text-blue-500"
              : "text-gray-350 group-hover/item:text-gray-500",
          collapsed ? "size-[20px]" : "size-[17px]",
        )}
        strokeWidth={active ? 2 : 1.7}
      />
      {!collapsed && (
        <>
          <span className="truncate flex-1">{item.label}</span>
          {isComingSoon && (
            <span
              className={cn(
                "size-1.5 rounded-full shrink-0 transition-all",
                active
                  ? "bg-sky-500"
                  : "bg-sky-300 group-hover/item:bg-sky-500",
              )}
              style={{
                boxShadow: active
                  ? "0 0 8px rgba(56, 189, 248, 0.6)"
                  : undefined,
              }}
            />
          )}
        </>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={12}
            className="text-[12px] font-medium"
          >
            {item.label}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  }

  return <li>{linkContent}</li>;
}
