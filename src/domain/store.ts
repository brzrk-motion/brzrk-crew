import {AgentId,Approval,approvalTransition,RunStatus} from './crew';
export interface Message{id:string;role:'user'|'assistant'|'system';agent?:AgentId;content:string;createdAt:number;evidence?:string[];uncertainties?:string[];proposedNextAction?:string;}
export interface Run{id:string;agent:AgentId;status:RunStatus;task:string;createdAt:number;finishedAt?:number;error?:string;output?:string;}
export interface Handoff{id:string;runId?:string;from:AgentId;to:AgentId;context:string;createdAt:number;}
export interface Event{id:string;type:string;text:string;createdAt:number;}
export interface Conversation{id:string;title:string;messages:Message[];runs:Run[];events:Event[];handoffs:Handoff[];approvals:Approval[];createdAt:number;updatedAt:number;}
export interface WorkspaceState {activeConversationId:string;conversations:Conversation[];}
const key='brzrk-crew-state';
export const newConversation=(title='Untitled workspace'):Conversation=>{const time=Date.now();return{id:crypto.randomUUID(),title,messages:[],runs:[],events:[],handoffs:[],approvals:[],createdAt:time,updatedAt:time};};
export const initialState=():WorkspaceState=>{const conversation=newConversation();return{activeConversationId:conversation.id,conversations:[conversation]};};
export function loadState():WorkspaceState{try{const raw=localStorage.getItem(key);if(!raw)return initialState();const parsed=JSON.parse(raw) as WorkspaceState;if(parsed.conversations?.length)return parsed;return initialState();}catch{return initialState();}}
export function saveState(state:WorkspaceState){localStorage.setItem(key,JSON.stringify(state));}
export function updateConversation(state:WorkspaceState,id:string,update:(conversation:Conversation)=>Conversation):WorkspaceState{return{...state,conversations:state.conversations.map(c=>c.id===id?update({...c,updatedAt:Date.now()}):c)};}
export function resolveApproval(conversation:Conversation,approvalId:string,decision:'approve'|'deny'):Conversation{const approval=conversation.approvals.find(item=>item.id===approvalId);if(!approval)return conversation;const next=approvalTransition(approval,decision);return{...conversation,approvals:conversation.approvals.map(item=>item.id===approvalId?next:item),runs:conversation.runs.map(run=>run.id===approval.runId?{...run,status:decision==='approve'?'completed':'cancelled',finishedAt:Date.now()}:run)};}
