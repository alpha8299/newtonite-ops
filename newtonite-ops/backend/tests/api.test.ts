import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app, prisma } from "../src/app.js";

describe("API boundary behavior",()=>{
  it("requires an authenticated identity header",async()=>{
    const response = await request(app).get("/api/me");
    expect(response.status).toBe(401);
  });
  it("keeps health endpoint public",async()=>{
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});

describe("critical behaviors (requires migrated and seeded PostgreSQL)",()=>{
  it("replays idempotent creates, rejects stale versions, and records audit history",async()=>{
    const admin = await prisma.user.findUnique({where:{id:"user-admin"}});
    const membership = await prisma.teamMember.findFirst({where:{userId:"user-admin"}});
    expect(admin).toBeTruthy();
    expect(membership).toBeTruthy();
    const key = `test-${randomUUID()}`;
    const payload = {title:`Critical behavior ${randomUUID()}`,description:"Exercise idempotency and optimistic concurrency.",teamId:membership!.teamId,priority:"MEDIUM"};
    const first = await request(app).post("/api/work-items").set("x-user-id","user-admin").set("Idempotency-Key",key).send(payload);
    expect(first.status).toBe(201);
    const replay = await request(app).post("/api/work-items").set("x-user-id","user-admin").set("Idempotency-Key",key).send(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.item.id).toBe(first.body.item.id);

    const itemId = first.body.item.id;
    const freshUpdate = await request(app).patch(`/api/work-items/${itemId}`).set("x-user-id","user-admin").send({version:1,priority:"HIGH"});
    expect(freshUpdate.status).toBe(200);
    expect(freshUpdate.body.version).toBe(2);
    const staleUpdate = await request(app).patch(`/api/work-items/${itemId}`).set("x-user-id","user-admin").send({version:1,priority:"URGENT"});
    expect(staleUpdate.status).toBe(409);
    const events = await prisma.auditEvent.findMany({where:{workItemId:itemId}});
    expect(events.some(event=>event.action==="CREATED")).toBe(true);
    expect(events.some(event=>event.action==="UPDATED")).toBe(true);
  });
  it("denies a viewer from creating work",async()=>{
    const membership = await prisma.teamMember.findFirst({where:{userId:"user-auditor"}});
    expect(membership).toBeTruthy();
    const response = await request(app).post("/api/work-items").set("x-user-id","user-auditor").set("Idempotency-Key",`test-${randomUUID()}`).send({title:"Unauthorized create test",description:"Should be denied",teamId:membership!.teamId});
    expect(response.status).toBe(403);
  });
});

afterAll(async()=>{await prisma.$disconnect();});
