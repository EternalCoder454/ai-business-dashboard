"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CommandPalette, SearchIcon } from "./CommandPalette";
import { useMessages } from "@/lib/messages";
import { useStore } from "@/lib/store";
import { useKeyboardInset } from "@/lib/viewport";
import { PRIMARY_LINKS, Sidebar, SidebarContent, isActive } from "./Sidebar";
import { CompanyMark } from "./CompanyMark";
import { ProfileMenu } from "./ProfileMenu";
import { LoadFailed } from "./LoadFailed";
import { WriteError } from "./WriteError";
import { setNavCollapsed, useNavCollapsed } from "@/lib/navCollapsed";
import { ChevronIcon, CloseIcon, NavBadge, cx } from "./ui";
import { createRipple } from "./ui/ripple";

/**
 * Adaptive shell built on Material 3 window size classes rather than device
 * breakpoints. Every variant renders and CSS decides which is visible, so there
 * is no width measurement, no hydration mismatch, and no layout flash.
 *
 *   compact   (under 600px)  top app bar + bottom navigation bar
 *   medium    (600 to 839)   navigation rail, drawer on demand
 *   expanded  (840 to 1199)  navigation rail, drawer on demand
 *   large     (1200 and up)  permanent navigation drawer
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const { settings } = useStore();
  const navCollapsed = useNavCollapsed();

  /** Cmd and Ctrl K always work. This is the bare key, which can be turned off. */
  const bareKey =
    settings.searchShortcut === "slash" ? "/" : settings.searchShortcut === "k" ? "k" : null;

  /**
   * Which edge the navigation sits on. Reversing the row moves the drawer, the
   * rail, and the modal drawer together, so nothing has to know about the other.
   */
  const navRight = settings.sidebarSide === "right";

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Cmd+K and Ctrl+K anywhere, plus a plain slash when nothing is focused,
  // which is the shortcut people try first in a list-heavy app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(
        (event.target as HTMLElement | null)?.tagName ?? "",
      );
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (
        bareKey &&
        event.key === bareKey &&
        !typing &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bareKey]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Nothing behind a modal drawer should scroll. Removing the scrollbar
    // shifts the page sideways by its width, so pad that width back.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [drawerOpen]);

  /**
   * A conversation is a detail view. On compact it takes the whole screen, with
   * a back arrow instead of the menu and no bottom bar, so the composer owns
   * the bottom edge the way it does in any messaging app.
   */
  const isConversation = pathname === "/ceo" || pathname.startsWith("/dept/");

  const title =
    ROUTE_TITLES.find(([href]) => isActive(pathname, href))?.[1] ??
    (pathname.startsWith("/dept/") ? "Department" : settings.companyName);

  const edgeSwipe = useEdgeSwipe(() => setDrawerOpen(true));
  useKeyboardInset();


  // Sign in is not part of the app: no nav, no drawer, nothing to navigate to.
  if (pathname === "/signin") return <>{children}</>;

  return (
    <div
      className={cx(
        "app-viewport flex w-full overflow-hidden bg-surface",
        navRight && "flex-row-reverse",
      )}
      onTouchStart={edgeSwipe.onTouchStart}
      onTouchMove={edgeSwipe.onTouchMove}
      onTouchEnd={edgeSwipe.onTouchEnd}
    >
      <Sidebar
        onOpenSearch={() => setSearchOpen(true)}
        collapsed={navCollapsed}
        onCollapse={() => setNavCollapsed(true)}
      />
      <NavigationRail
        pathname={pathname}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        collapsed={navCollapsed}
        onExpand={() => setNavCollapsed(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {isConversation ? null : (
          <TopAppBar
            title={title}
            onOpenDrawer={() => setDrawerOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
          />
        )}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
        {/* Above the bottom bar rather than over it. Fixed to the viewport, it
            landed exactly on the navigation. */}
        <WriteError />
        <LoadFailed />
        {isConversation ? null : (
          <BottomBar pathname={pathname} onOpenDrawer={() => setDrawerOpen(true)} />
        )}
      </div>

      <ModalDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenSearch={() => {
          setDrawerOpen(false);
          setSearchOpen(true);
        }}
      />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

const ROUTE_TITLES: [string, string][] = [
  ["/ceo", "Chief of Staff"],
  ["/all-hands", "Ask Everyone"],
  ["/messages", "Inbox"],
  ["/onboarding", "Internal Wiki"],
  ["/tasks", "Tasks"],
  ["/projects", "Projects"],
  ["/admin", "Operator"],
  ["/library/skills", "Skills"],
  ["/library/deliverables", "Deliverables"],
  ["/library", "Library"],
  ["/information", "Information"],
  ["/profile", "Company Profile"],
  ["/account", "Account"],
  ["/settings", "Settings"],
  ["/", "Dashboard"],
];

/**
 * Dragging in from the left edge opens the drawer, which is the gesture every
 * mobile app trains people to expect. Only the first 24px of the screen starts
 * it, so it never fights a horizontal scroller further in.
 */
function useEdgeSwipe(onOpen: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    fired.current = false;
    start.current = touch.clientX <= 24 ? { x: touch.clientX, y: touch.clientY } : null;
  }, []);

  const onTouchMove = useCallback(
    (event: React.TouchEvent) => {
      if (!start.current || fired.current) return;
      const touch = event.touches[0];
      const dx = touch.clientX - start.current.x;
      const dy = Math.abs(touch.clientY - start.current.y);
      // Horizontal intent only, so a diagonal scroll does not open it.
      if (dx > 56 && dy < 40) {
        fired.current = true;
        start.current = null;
        onOpen();
      }
    },
    [onOpen],
  );

  const onTouchEnd = useCallback(() => {
    start.current = null;
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd };
}

/**
 * Compact windows have no rail and no drawer, so the app bar carries navigation
 * and the current destination. From medium up the rail takes over, and each
 * page's own header already shows the title, so this would be duplication.
 */
function TopAppBar({
  title,
  onOpenDrawer,
  onOpenSearch,
}: {
  title: string;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
}) {
  return (
    <header className="safe-top safe-x flex flex-none items-center gap-1 border-b border-outline-variant bg-low px-1 medium:hidden">
      <button
        onClick={(event) => {
          createRipple(event);
          onOpenDrawer();
        }}
        aria-label="Open navigation drawer"
        className="md-state my-1 grid h-12 w-12 flex-none place-items-center rounded-full text-on-surface"
      >
        <MenuIcon />
      </button>
      <span className="md-title truncate">{title}</span>
      <button
        onClick={(event) => {
          createRipple(event);
          onOpenSearch();
        }}
        aria-label="Search"
        className="md-state ml-auto grid h-12 w-12 flex-none place-items-center rounded-full text-on-variant"
      >
        <SearchIcon className="h-5 w-5" />
      </button>
      {/* The account menu belongs up here on a phone rather than in the page
          header, where it had to wrap onto a line of its own behind whatever
          buttons the page already had. */}
      <div className="mr-2 flex-none [--badge-ring:var(--md-container-low)]">
        <ProfileMenu />
      </div>
    </header>
  );
}

/**
 * Medium and expanded windows get a rail. Icons over a short label, 80px wide.
 *
 * It also stands in for the permanent drawer at large once that is collapsed,
 * so the two states of the sidebar are the drawer and this, rather than a
 * third narrow layout nobody maintains.
 */
function NavigationRail({
  pathname,
  onOpenDrawer,
  onOpenSearch,
  collapsed,
  onExpand,
}: {
  pathname: string;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  collapsed: boolean;
  onExpand: () => void;
}) {
  return (
    <nav
      className={cx(
        "safe-left hidden w-20 flex-none flex-col items-center gap-1",
        // Scrolls, because a phone held sideways is 360px tall and the rail is
        // taller than that: without this the last destinations are simply
        // unreachable.
        "border-r border-outline-variant bg-low py-3 medium:flex overflow-y-auto rail-scroll",
        collapsed ? "large:flex" : "large:hidden",
      )}
    >
      {/* Two controls in one slot, because what the top of the rail does
          depends on the window: below large there is a drawer to open, and at
          large the drawer is this, collapsed, so it expands instead. Which one
          shows is left to CSS, in keeping with the rest of the shell. */}
      <button
        onClick={(event) => {
          createRipple(event);
          onOpenDrawer();
        }}
        aria-label="Open navigation drawer"
        className="md-state mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-primary-container text-on-primary-container shadow-e1 large:hidden"
      >
        <MenuIcon />
      </button>

      <button
        onClick={(event) => {
          createRipple(event);
          onExpand();
        }}
        aria-label="Expand the sidebar"
        title="Expand the sidebar"
        className="md-state group relative mb-2 hidden place-items-center rounded-xl transition-transform active:scale-95 large:grid"
      >
        <CompanyMark size={48} />
        <span
          aria-hidden
          className={cx(
            "pointer-events-none absolute inset-0 grid place-items-center rounded-xl",
            "bg-highest/85 text-on-surface opacity-0 transition-opacity",
            "group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          <ChevronIcon className="h-4 w-4" />
        </span>
      </button>

      <button
        onClick={(event) => {
          createRipple(event);
          onOpenSearch();
        }}
        aria-label="Search"
        className="md-state mb-1 grid h-8 w-14 place-items-center rounded-full text-on-variant"
      >
        <SearchIcon className="h-5 w-5" />
      </button>

      {PRIMARY_LINKS.map((link) => (
        <RailItem key={link.href} link={link} active={isActive(pathname, link.href)} />
      ))}
    </nav>
  );
}

function RailItem({
  link,
  active,
}: {
  link: (typeof PRIMARY_LINKS)[number];
  active: boolean;
}) {
  const { unread } = useMessages();
  return (
    <Link
      href={link.href}
      onClick={createRipple}
      aria-current={active ? "page" : undefined}
      className="flex w-full flex-col items-center gap-1 py-1"
    >
      <span
        className={cx(
          "md-state relative grid h-8 w-14 place-items-center rounded-full transition-colors",
          active ? "bg-secondary-container text-on-secondary-container" : "text-on-variant",
        )}
      >
        {link.icon}
        {link.href === "/messages" ? (
          <NavBadge count={unread} label={`${unread} unread messages`} />
        ) : null}
      </span>
      <span className={cx("md-label-sm", active ? "text-on-surface" : "text-on-variant")}>
        {link.short}
      </span>
    </Link>
  );
}

/** Compact windows get a bottom bar. Five destinations is the Material maximum. */
function BottomBar({
  pathname,
  onOpenDrawer,
}: {
  pathname: string;
  onOpenDrawer: () => void;
}) {
  const { unread } = useMessages();
  return (
    <nav className="safe-bottom safe-x flex flex-none items-stretch border-t border-outline-variant bg-low medium:hidden">
      {PRIMARY_LINKS.slice(0, 4).map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={createRipple}
            aria-current={active ? "page" : undefined}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-2"
          >
            <span
              className={cx(
                "md-state relative grid h-8 w-16 place-items-center rounded-full transition-colors",
                active
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-variant",
              )}
            >
              {link.icon}
              {link.href === "/messages" ? (
                <NavBadge count={unread} label={`${unread} unread messages`} />
              ) : null}
            </span>
            <span className={cx("md-label-sm", active ? "text-on-surface" : "text-on-variant")}>
              {link.short}
            </span>
          </Link>
        );
      })}

      <button
        onClick={(event) => {
          createRipple(event);
          onOpenDrawer();
        }}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-on-variant"
      >
        <span className="md-state grid h-8 w-16 place-items-center rounded-full">
          <MenuIcon />
        </span>
        <span className="md-label-sm">More</span>
      </button>
    </nav>
  );
}

/** The full drawer, opened on demand below the large window size class. */
function ModalDrawer({
  open,
  onClose,
  onOpenSearch,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSearch: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 large:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="animate-slide-in safe-top safe-bottom absolute inset-y-0 left-0 flex w-[18.75rem] max-w-[85vw] flex-col bg-low shadow-e3"
      >
        <div className="flex justify-end px-2 pt-2">
          <button
            onClick={onClose}
            aria-label="Close navigation drawer"
            className="md-state grid h-12 w-12 place-items-center rounded-full text-on-variant"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent onNavigate={onClose} onOpenSearch={onOpenSearch} />
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden className="h-5 w-5">
      <path d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z" />
    </svg>
  );
}


