"use client";

/**
 * PageHeader — the standard top band for every screen in the dashboard.
 *
 * Replaces the ad-hoc `<h1 className="text-2xl md:text-3xl font-bold">` blocks
 * scattered across screens. A POS is a dense working tool: the header is a
 * compact 15px title + a right-aligned action cluster, not a marketing hero.
 *
 * Usage:
 *   <PageHeader
 *     title="Customers"
 *     description="1,240 total"
 *     actions={<Button size="sm">Add customer</Button>}
 *   />
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional tab strip / filter row rendered flush under the title row. */
  children?: React.ReactNode;
  /** Stick to the top of the scroll container. */
  sticky?: boolean;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  children,
  sticky = false,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "border-b border-border bg-background",
        sticky && "sticky top-0 z-20",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold leading-tight text-foreground sm:text-base">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children ? <div className="px-4 sm:px-6">{children}</div> : null}
    </div>
  );
}

/**
 * PageBody — consistent inner padding + max width for screen content that sits
 * under a PageHeader.
 */
export function PageBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6 sm:py-6", className)}>
      {children}
    </div>
  );
}
