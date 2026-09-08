export type AgentId='breakwater'|'reef'|'swell'|'tide'|'wake';
export type RunStatus='queued'|'working'|'waiting_for_input'|'waiting_for_approval'|'handing_off'|'completed'|'failed'|'cancelled';
export type ApprovalStatus='pending'|'approved'|'denied';
export interface Agent {id:AgentId; name:string; role:string; color:string; initials:string;}
export const AGENTS:Agent[]=[
 {id:'breakwater',name:'Breakwater',role:'Manager · orchestration',color:'#79b9ff',initials:'BW'},
 {id:'reef',name:'Reef',role:'Research · evidence',color:'#a3d9c9',initials:'RF'},
 {id:'swell',name:'Swell',role:'Documentation · clarity',color:'#d8b5ff',initials:'SW'},
 {id:'tide',name:'Tide',role:'Outreach · drafts',color:'#ffba85',initials:'TD'},
 {id:'wake',name:'Wake',role:'Review · verification',color:'#f3df83',initials:'WK'}
];
export const agentById=(id:AgentId)=>AGENTS.find(a=>a.id===id)!;
const aliases:Record<string,AgentId>={breakwater:'breakwater',manager:'breakwater',reef:'reef',research:'reef',swell:'swell',docs:'swell',documentation:'swell',tide:'tide',outreach:'tide',wake:'wake',review:'wake'};
export function routeMessage(text:string):AgentId[]{const mentions=[...text.matchAll(/@([a-z-]+)/gi)].map(m=>aliases[m[1].toLowerCase()]).filter(Boolean);if(mentions.length)return [...new Set(mentions)];const lower=text.toLowerCase();if(/research|source|compare|evidence/.test(lower))return ['reef'];if(/document|readme|write|explain/.test(lower))return ['swell'];if(/outreach|email|contact|draft/.test(lower))return ['tide'];if(/review|test|check|verify/.test(lower))return ['wake'];return ['breakwater'];}
export interface Approval {id:string; runId:string; action:string; payload:string; status:ApprovalStatus; createdAt:number;}
export function approvalTransition(approval:Approval,decision:'approve'|'deny'):Approval{if(approval.status!=='pending')return approval;return {...approval,status:decision==='approve'?'approved':'denied'};}
export function nextRunStatus(current:RunStatus,event:'start'|'handoff'|'approval'|'complete'|'fail'|'cancel'):RunStatus{if(event==='start')return current==='queued'?'working':current;if(event==='handoff')return 'handing_off';if(event==='approval')return 'waiting_for_approval';if(event==='complete')return 'completed';if(event==='fail')return 'failed';return 'cancelled';}
