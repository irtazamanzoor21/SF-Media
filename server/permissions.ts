import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import type { ModuleKey, ActionKey } from "@shared/schema";

export function requirePermission(module: ModuleKey, action: ActionKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (user.systemRole === "super_admin") {
      return next();
    }

    const ctx = await getUserOrgContext(userId);
    if (!ctx?.membership) {
      return next();
    }

    const membership = ctx.membership;

    if (membership.systemRole === "admin" || membership.systemRole === "super_admin") {
      return next();
    }

    const permissions = await storage.getUserPermissions(userId, membership.organizationId);
    const hasPermission = permissions.some(
      p => p.module === module && p.action === action && p.granted
    );

    if (!hasPermission) {
      return res.status(403).json({
        message: "Access denied: You do not have permission for this module.",
      });
    }

    next();
  };
}

export function requireAdmin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (user.systemRole === "super_admin") {
      return next();
    }

    const ctx = await getUserOrgContext(userId);
    if (!ctx?.membership) {
      return res.status(403).json({ message: "Access denied: Admin role required." });
    }

    const membership = ctx.membership;
    if (membership.systemRole !== "admin" && membership.systemRole !== "super_admin") {
      return res.status(403).json({ message: "Access denied: Admin role required." });
    }

    next();
  };
}

export function requireSuperAdmin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user || user.systemRole !== "super_admin") {
      return res.status(403).json({ message: "Access denied: Super Admin role required." });
    }

    next();
  };
}

export async function getUserOrgContext(userId: number) {
  const user = await storage.getUser(userId);
  if (!user || user.systemRole === "super_admin") return null;

  if (user.organizationId) {
    const [org, membership] = await Promise.all([
      storage.getOrganizationById(user.organizationId),
      storage.getOrganizationMember(userId, user.organizationId),
    ]);
    if (!org || !membership) return null;
    return { membership, organization: org };
  }

  const memberships = await storage.getUserOrganizations(userId);
  if (memberships.length !== 1) return null;
  const membership = memberships[0];
  await storage.updateUser(userId, { organizationId: membership.organizationId } as any);
  const org = await storage.getOrganizationById(membership.organizationId);
  if (!org) return null;
  return { membership, organization: org };
}

const ORG_SCOPED_PREFIXES = [
  "/api/campaigns",
  "/api/brand-profile",
  "/api/media",
  "/api/roles",
  "/api/organization",
  "/api/organizations",
  "/api/brainstorm",
  "/api/ai-generate",
  "/api/market-intelligence",
  "/api/social",
  "/api/scheduled-posts",
  "/api/subscription",
  "/api/quota",
];

export function requireNotBlocked() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const isOrgScoped = ORG_SCOPED_PREFIXES.some((prefix) => req.path.startsWith(prefix));
    if (!isOrgScoped) return next();

    const userId = req.session.userId;
    if (!userId) return next();

    const user = await storage.getUser(userId);
    if (!user || user.systemRole === "super_admin") return next();

    const ctx = await getUserOrgContext(userId);
    if (!ctx?.membership) return next();

    if (ctx.membership.isBlocked) {
      return res.status(403).json({ message: "Your access has been suspended by an administrator." });
    }

    next();
  };
}
