import { PrismaClient, Role, Priority, WorkStatus } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const admin = await prisma.user.upsert({where:{id:"user-admin"}, update:{}, create:{id:"user-admin",name:"Alex Morgan",email:"alex@newtonite.local"}});
  const member = await prisma.user.upsert({where:{id:"user-member"}, update:{}, create:{id:"user-member",name:"Sam Lee",email:"sam@newtonite.local"}});
  const auditor = await prisma.user.upsert({where:{id:"user-auditor"}, update:{}, create:{id:"user-auditor",name:"Taylor Reed",email:"taylor@newtonite.local"}});
  const ops = await prisma.team.upsert({where:{name:"Operations"}, update:{}, create:{name:"Operations"}});
  const engineering = await prisma.team.upsert({where:{name:"Engineering"}, update:{}, create:{name:"Engineering"}});
  for (const [user, team, role] of [
    [admin,ops,Role.ADMIN],[member,ops,Role.MEMBER],[auditor,ops,Role.VIEWER],
    [admin,engineering,Role.ADMIN],[member,engineering,Role.MEMBER]
  ] as const) {
    await prisma.teamMember.upsert({where:{userId_teamId:{userId:user.id,teamId:team.id}},update:{role},create:{userId:user.id,teamId:team.id,role}});
  }
  const count = await prisma.workItem.count();
  if (!count) {
    const samples = [
      {title:"Investigate delayed customer payout",description:"Several customer payouts are delayed beyond the expected settlement window.",status:WorkStatus.IN_PROGRESS,priority:Priority.URGENT,teamId:ops.id,assigneeId:member.id,createdById:admin.id,requiresApproval:true},
      {title:"Review production alert noise",description:"Identify the top recurring alerts and recommend thresholds.",status:WorkStatus.OPEN,priority:Priority.HIGH,teamId:engineering.id,assigneeId:member.id,createdById:admin.id,requiresApproval:false},
      {title:"Update vendor access review",description:"Confirm access owners and capture the review decision.",status:WorkStatus.BLOCKED,priority:Priority.MEDIUM,teamId:ops.id,assigneeId:null,createdById:admin.id,requiresApproval:true}
    ];
    for (const data of samples) {
      const item = await prisma.workItem.create({data});
      await prisma.auditEvent.create({data:{workItemId:item.id,actorId:admin.id,action:"CREATED",changes:{title:item.title,status:item.status,priority:item.priority}}});
    }
  }
}
main().finally(()=>prisma.$disconnect());
