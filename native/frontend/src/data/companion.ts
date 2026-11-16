import { serviceCall } from "../platform/bridge";

export type CompanionSettings={revision:number;mode:string;timezone:string;quietUntil:string;quietStart:string;quietEnd:string;gameMode:boolean;proactive:boolean;companionChat:boolean;reminderException:boolean;dailyReport:boolean;reportTime:string;petHidden:boolean;petMotion:boolean};
export type Attention={id:string;revision:number;goal:string;state:string;scopeType:string;scopeId:string;sessionId:string;condition:{kind:string;itemId:string;status?:string;minutesBefore?:number;paths?:string[]};next:string;expires:string;sources:unknown[]};
export type CompanionSnapshot={settings:CompanionSettings;personaVersion:number;persona:{system_prompt:string;reactivity?:number;recoveryScale?:number};affect:{revision:number;scores:Record<string,number>;reason:string};attentions:Attention[];projects:{id:string;name:string;hasWorkspace:boolean;muted:boolean}[];reports:{id:string;date:string;text:string}[];audit:{seq:number;proposal:unknown;delta:unknown;state:string;at:string}[]};
export const companionApi={
  load:()=>serviceCall<CompanionSnapshot>("Chat.Companion"),
  settings:(settings:CompanionSettings)=>serviceCall<CompanionSettings>("Chat.SaveCompanionSettings",JSON.stringify(settings)),
  persona:(profile:CompanionSnapshot["persona"]&{version:number})=>serviceCall<void>("Chat.SavePersona",JSON.stringify(profile)),
  saveAttention:(attention:Partial<Attention>)=>serviceCall<Attention>("Chat.SaveAttention",JSON.stringify(attention)),
  changeAttention:(attention:Attention,state:string)=>serviceCall<void>("Chat.ChangeAttention",JSON.stringify({id:attention.id,revision:attention.revision,state})),
  projectQuiet:(id:string,muted:boolean)=>serviceCall<void>("Chat.SetProjectQuiet",JSON.stringify({id,muted})),
};
