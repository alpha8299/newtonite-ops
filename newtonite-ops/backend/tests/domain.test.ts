import { describe, expect, it } from "vitest";
import { canAdmin, canTransition, canWrite } from "../src/domain.js";
describe("workflow and authorization domain rules",()=>{
  it("allows only explicit transitions",()=>{
    expect(canTransition("OPEN","IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS","OPEN")).toBe(false);
    expect(canTransition("BLOCKED","RESOLVED")).toBe(false);
  });
  it("allows admins and members to write, but viewers cannot",()=>{
    expect(canWrite("ADMIN")).toBe(true);
    expect(canWrite("MEMBER")).toBe(true);
    expect(canWrite("VIEWER")).toBe(false);
    expect(canAdmin("MEMBER")).toBe(false);
  });
});
