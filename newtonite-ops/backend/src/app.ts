import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { Prisma, PrismaClient, Priority, WorkStatus } from "@prisma/client";
import { z } from "zod";
import { canAdmin, canTransition, canWrite } from "./domain.js";

export const prisma = new PrismaClient();
export const app = express();
app.use(cors());
app.use(express.json({limit:"1mb"}));

type Actor = { id: string; name: string };
declare global { namespace Express { interface Request { actor?: Actor } } }
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req,res,next)).catch(next);

app.get("/api/health", (_req,res)=>res.json({ok:true,service:"newtonite-api"}));

const auth = asyncHandler(async (req,res,next) => {
  const userId = req.header("x-user-id");
  if (!userId) return res.status(401).json({error:"Authentication required",code:"UNAUTHENTICATED"});
  const user = await prisma.user.findUnique({where:{id:userId},select:{id:true,name:true}});
  if (!user) return res.status(401).json({error:"Unknown demo identity",code:"UNAUTHENTICATED"});
  req.actor = user;
  next();
});
app.use("/api", (req,res,next) => req.path === "/health" ? next() : auth(req,res,next));

async function membership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({where:{userId_teamId:{userId,teamId}}});
}
async function getItemAccess(itemId: string, userId: string) {
  const item = await prisma.workItem.findUnique({where:{id:itemId}});
  if (!item) return {item:null, member:null};
  const member = await membership(userId,item.teamId);
  return {item,member};
}
function requireMember(member: {role:string}|null) {
  return !!member;
}
function requireWriter(member: {role:string}|null) {
  return !!member && canWrite(member.role);
}
function requireAdmin(member: {role:string}|null) {
  return !!member && canAdmin(member.role);
}
const createSchema = z.object({
  title:z.string().trim().min(3).max(180),
  description:z.string().trim().min(1).max(10000),
  teamId:z.string().min(1),
  assigneeId:z.string().nullable().optional(),
  priority:z.nativeEnum(Priority).default(Priority.MEDIUM),
  dueAt:z.string().datetime().nullable().optional(),
  requiresApproval:z.boolean().default(false)
});
const patchSchema = z.object({
  version:z.number().int().positive(),
  title:z.string().trim().min(3).max(180).optional(),
  description:z.string().trim().min(1).max(10000).optional(),
  priority:z.nativeEnum(Priority).optional(),
  assigneeId:z.string().nullable().optional(),
  dueAt:z.string().datetime().nullable().optional()
}).refine(v=>Object.keys(v).some(k=>k!=="version"),"At least one field must change");
const transitionSchema = z.object({version:z.number().int().positive(),to:z.nativeEnum(WorkStatus)});

app.get("/api/me", asyncHandler(async(req,res)=>{
  const user = await prisma.user.findUnique({where:{id:req.actor!.id},include:{memberships:{include:{team:true}}}});
  res.json(user);
}));
app.get("/api/teams", asyncHandler(async(req,res)=>{
  const memberships = await prisma.teamMember.findMany({where:{userId:req.actor!.id},include:{team:true},orderBy:{team:{name:"asc"}}});
  res.json(memberships.map(m=>({id:m.team.id,name:m.team.name,role:m.role})));
}));
app.get("/api/users", asyncHandler(async(req,res)=>{
  const teamId = String(req.query.teamId || "");
  const member = await membership(req.actor!.id,teamId);
  if (!member) return res.status(403).json({error:"You are not a member of this team",code:"FORBIDDEN"});
  const members = await prisma.teamMember.findMany({where:{teamId},include:{user:{select:{id:true,name:true,email:true}}},orderBy:{user:{name:"asc"}}});
  res.json(members.map(m=>({...m.user,role:m.role})));
}));
app.get("/api/dashboard/summary", asyncHandler(async(req,res)=>{
  const teamRows = await prisma.teamMember.findMany({where:{userId:req.actor!.id},select:{teamId:true}});
  const teamIds = teamRows.map(x=>x.teamId);
  const where = {teamId:{in:teamIds},status:{not:WorkStatus.RESOLVED}};
  const [open,urgent,mine,blocked] = await Promise.all([
    prisma.workItem.count({where}),
    prisma.workItem.count({where:{...where,priority:Priority.URGENT}}),
    prisma.workItem.count({where:{...where,assigneeId:req.actor!.id}}),
    prisma.workItem.count({where:{...where,status:WorkStatus.BLOCKED}})
  ]);
  res.json({open,urgent,mine,blocked});
}));
app.get("/api/work-items", asyncHandler(async(req,res)=>{
  const page = Math.max(1,Number(req.query.page)||1);
  const limit = Math.min(100,Math.max(1,Number(req.query.limit)||20));
  const memberships = await prisma.teamMember.findMany({where:{userId:req.actor!.id},select:{teamId:true}});
  const teamIds = memberships.map(m=>m.teamId);
  const where: Prisma.WorkItemWhereInput = {teamId:{in:teamIds}};
  if (req.query.status && req.query.status !== "ALL") where.status = req.query.status as WorkStatus;
  if (req.query.priority && req.query.priority !== "ALL") where.priority = req.query.priority as Priority;
  if (req.query.teamId) where.teamId = String(req.query.teamId);
  if (req.query.assigneeId === "ME") where.assigneeId = req.actor!.id;
  else if (req.query.assigneeId) where.assigneeId = String(req.query.assigneeId);
  if (req.query.search) where.OR = [
    {title:{contains:String(req.query.search),mode:"insensitive"}},
    {description:{contains:String(req.query.search),mode:"insensitive"}}
  ];
  const [items,total] = await Promise.all([
    prisma.workItem.findMany({where,include:{team:{select:{id:true,name:true}},comments:{take:1,orderBy:{createdAt:"desc"},include:{author:{select:{name:true}}}}},orderBy:[{priority:"desc"},{updatedAt:"desc"}],skip:(page-1)*limit,take:limit}),
    prisma.workItem.count({where})
  ]);
  res.json({items,total,page,limit,pages:Math.ceil(total/limit)});
}));
app.post("/api/work-items", asyncHandler(async(req,res)=>{
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error:"Invalid work item",details:parsed.error.flatten()});
  const data = parsed.data;
  const member = await membership(req.actor!.id,data.teamId);
  if (!requireWriter(member)) return res.status(403).json({error:"You cannot create work in this team",code:"FORBIDDEN"});
  if (data.assigneeId) {
    const assigneeMembership = await membership(data.assigneeId,data.teamId);
    if (!assigneeMembership) return res.status(422).json({error:"Assignee must belong to the selected team",code:"INVALID_ASSIGNEE"});
  }
  const key = req.header("Idempotency-Key");
  if (!key || key.length < 8 || key.length > 200) return res.status(400).json({error:"Provide an Idempotency-Key header (8–200 chars)",code:"IDEMPOTENCY_KEY_REQUIRED"});
  try {
    const result = await prisma.$transaction(async tx=>{
      const prior = await tx.idempotencyRecord.findUnique({where:{userId_key:{userId:req.actor!.id,key}}});
      if (prior) return {response:prior.response as object,replayed:true};
      const item = await tx.workItem.create({data:{
        title:data.title,description:data.description,teamId:data.teamId,createdById:req.actor!.id,
        assigneeId:data.assigneeId ?? null,priority:data.priority,
        dueAt:data.dueAt ? new Date(data.dueAt) : null,requiresApproval:data.requiresApproval
      },include:{team:true}});
      await tx.auditEvent.create({data:{workItemId:item.id,actorId:req.actor!.id,action:"CREATED",changes:{title:item.title,status:item.status,priority:item.priority,assigneeId:item.assigneeId}}});
      const response = {item};
      await tx.idempotencyRecord.create({data:{userId:req.actor!.id,key,response}});
      return {response,replayed:false};
    });
    res.status(result.replayed ? 200 : 201).json({...result.response,replayed:result.replayed});
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await prisma.idempotencyRecord.findUnique({where:{userId_key:{userId:req.actor!.id,key}}});
      if (prior) return res.status(200).json({...prior.response as object,replayed:true});
    }
    throw error;
  }
}));
app.get("/api/work-items/:id", asyncHandler(async(req,res)=>{
  const {item,member} = await getItemAccess(req.params.id,req.actor!.id);
  if (!item) return res.status(404).json({error:"Work item not found"});
  if (!requireMember(member)) return res.status(403).json({error:"No access to this work item",code:"FORBIDDEN"});
  const full = await prisma.workItem.findUnique({where:{id:item.id},include:{
    team:true,comments:{orderBy:{createdAt:"desc"},take:50,include:{author:{select:{id:true,name:true}}}},
    auditEvents:{orderBy:{createdAt:"desc"},take:50,include:{actor:{select:{id:true,name:true}}}}
  }});
  res.json(full);
}));
app.patch("/api/work-items/:id", asyncHandler(async(req,res)=>{
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error:"Invalid update",details:parsed.error.flatten()});
  const data = parsed.data;
  const {item,member} = await getItemAccess(req.params.id,req.actor!.id);
  if (!item) return res.status(404).json({error:"Work item not found"});
  if (!requireWriter(member)) return res.status(403).json({error:"Insufficient permissions",code:"FORBIDDEN"});
  if (data.assigneeId) {
    const assigneeMembership = await membership(data.assigneeId,item.teamId);
    if (!assigneeMembership) return res.status(422).json({error:"Assignee must belong to the item's team",code:"INVALID_ASSIGNEE"});
  }
  const {version,dueAt,...fields} = data;
  const update: Prisma.WorkItemUpdateManyMutationInput = {...fields};
  if (dueAt !== undefined) update.dueAt = dueAt ? new Date(dueAt) : null;
  try {
    const updated = await prisma.$transaction(async tx=>{
      const result = await tx.workItem.updateMany({where:{id:item.id,version},data:{...update,version:{increment:1},updatedAt:new Date()}});
      if (result.count !== 1) throw Object.assign(new Error("This item changed since you opened it. Refresh and retry."),{status:409,code:"STALE_VERSION"});
      const current = await tx.workItem.findUniqueOrThrow({where:{id:item.id}});
      const changes: Record<string,unknown> = {};
      for (const [key,value] of Object.entries(fields)) changes[key] = {from:(item as any)[key] ?? null,to:value ?? null};
      await tx.auditEvent.create({data:{workItemId:item.id,actorId:req.actor!.id,action:"UPDATED",changes: changes as Prisma.InputJsonValue}});
      return current;
    });
    res.json(updated);
  } catch(error) { throw error; }
}));
app.post("/api/work-items/:id/transition", asyncHandler(async(req,res)=>{
  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error:"Invalid transition request",details:parsed.error.flatten()});
  const {version,to} = parsed.data;
  const {item,member} = await getItemAccess(req.params.id,req.actor!.id);
  if (!item) return res.status(404).json({error:"Work item not found"});
  if (!requireWriter(member)) return res.status(403).json({error:"Insufficient permissions",code:"FORBIDDEN"});
  if (!canTransition(item.status,to)) return res.status(422).json({error:`Transition ${item.status} → ${to} is not allowed`,code:"INVALID_TRANSITION"});
  if (item.requiresApproval && to === "RESOLVED" && !requireAdmin(member)) {
    return res.status(422).json({error:"This item requires approval before resolution",code:"APPROVAL_REQUIRED"});
  }
  const result = await prisma.$transaction(async tx=>{
    const updated = await tx.workItem.updateMany({where:{id:item.id,version},data:{status:to,version:{increment:1},updatedAt:new Date()}});
    if (!updated.count) throw Object.assign(new Error("This item changed since you opened it. Refresh and retry."),{status:409,code:"STALE_VERSION"});
    const current = await tx.workItem.findUniqueOrThrow({where:{id:item.id}});
    await tx.auditEvent.create({data:{workItemId:item.id,actorId:req.actor!.id,action:"STATUS_CHANGED",changes:{from:item.status,to}}});
    return current;
  });
  res.json(result);
}));
app.post("/api/work-items/:id/comments", asyncHandler(async(req,res)=>{
  const body = z.object({body:z.string().trim().min(1).max(5000)}).safeParse(req.body);
  if (!body.success) return res.status(400).json({error:"Comment must be 1–5000 characters"});
  const {item,member} = await getItemAccess(req.params.id,req.actor!.id);
  if (!item) return res.status(404).json({error:"Work item not found"});
  if (!requireWriter(member)) return res.status(403).json({error:"Insufficient permissions",code:"FORBIDDEN"});
  const comment = await prisma.$transaction(async tx=>{
    const c = await tx.comment.create({data:{workItemId:item.id,authorId:req.actor!.id,body:body.data.body},include:{author:{select:{id:true,name:true}}}});
    await tx.auditEvent.create({data:{workItemId:item.id,actorId:req.actor!.id,action:"COMMENT_ADDED",changes:{commentId:c.id}}});
    return c;
  });
  res.status(201).json(comment);
}));
app.get("/api/work-items/:id/audit", asyncHandler(async(req,res)=>{
  const {item,member} = await getItemAccess(req.params.id,req.actor!.id);
  if (!item) return res.status(404).json({error:"Work item not found"});
  if (!requireMember(member)) return res.status(403).json({error:"No access to this work item",code:"FORBIDDEN"});
  const page = Math.max(1,Number(req.query.page)||1);
  const events = await prisma.auditEvent.findMany({where:{workItemId:item.id},include:{actor:{select:{name:true}}},orderBy:{createdAt:"desc"},skip:(page-1)*50,take:50});
  res.json({events,page,limit:50});
}));
app.use((err: any,_req:Request,res:Response,_next:NextFunction)=>{
  const status = Number(err?.status)||500;
  if (status >= 500) console.error(err);
  res.status(status).json({error:status>=500?"Internal server error":err.message,code:err.code||"REQUEST_FAILED"});
});
