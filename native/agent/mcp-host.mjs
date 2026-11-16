import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { McpClient, StdioTransport, StreamableHttpTransport, createMcpToolName, normalizeMcpInputSchema } from "@earendil-works/pi-mcp";
import { validateToolArguments } from "@earendil-works/pi-ai";

const token=process.env.CHELA_MCP_TOKEN;
if(!token)throw new Error("Missing private MCP host token");
let client,toolMap=new Map();
const controllers=new Map();
const write=value=>process.stdout.write(JSON.stringify({token,...value})+"\n");
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function handle(method,p,signal){
  if(method==="connect"){
    if(client)throw new Error("Connection already owned");
    client=new McpClient({name:"Chela",version:"1",requestTimeoutMs:30000});
    const transport=p.url?new StreamableHttpTransport({url:p.url,headers:p.headers||{},maxMessageBytes:1024*1024}):new StdioTransport({command:p.command,args:p.args||[],cwd:p.cwd,env:p.env||{},inheritEnv:false,maxMessageBytes:1024*1024});
    try{await client.connect(transport);return await handle("catalog",p,signal)}catch(error){await client.close();throw error}
  }
  if(!client)throw new Error("MCP is not connected");
  if(method==="catalog"){
    const remote=client.serverCapabilities?.tools?await client.listTools({signal}):[];
    if(remote.length>500)throw new Error("MCP 工具超过 500 项，请缩小此连接的能力范围");
    const names=new Set(),next=new Map();
    for(const tool of remote){
      const name=createMcpToolName(p.id,tool.name,n=>names.has(n));if(names.has(name))throw new Error("MCP tool name collision");names.add(name);
      const definition={name,remote:tool.name,description:tool.description||tool.name,parameters:normalizeMcpInputSchema(tool.inputSchema),annotations:tool.annotations||{}};
      definition.version=hash(definition);next.set(name,definition);
    }
    if(client.serverCapabilities?.resources){for(const [kind,description,parameters] of [
      ["resources","列出此 MCP 服务的资源",{type:"object",properties:{cursor:{type:"string"}},additionalProperties:false}],
      ["templates","列出此 MCP 服务的资源模板",{type:"object",properties:{cursor:{type:"string"}},additionalProperties:false}],
      ["read","读取此 MCP 服务的指定资源 URI",{type:"object",properties:{uri:{type:"string"}},required:["uri"],additionalProperties:false}],
    ]){const name=createMcpToolName(p.id,`chela_${kind}`,n=>names.has(n));names.add(name);const definition={name,remote:`chela_${kind}`,kind,description,parameters};definition.version=hash(definition);next.set(name,definition)}}
    toolMap=next;
    return {tools:[...next.values()],server:client.serverInfo,resources:!!client.serverCapabilities?.resources};
  }
  if(method==="validate"||method==="call"){
    const tool=toolMap.get(p.name);if(!tool||tool.version!==p.version)throw new Error("MCP 工具版本已变化，请在空闲时重新连接");
    const args=validateToolArguments(tool,{name:p.name,arguments:p.arguments});
    if(method==="validate")return args;
    const result=tool.kind?{content:[{type:"text",text:JSON.stringify(await handle(tool.kind,args,signal))}]}:await client.callTool(tool.remote,args,{signal});
    if(Buffer.byteLength(JSON.stringify(result))>512*1024)return {content:[{type:"text",text:"服务已返回结果，但内容超过 512 KiB；请到原服务查看。"}],isError:true};
    return result;
  }
  if(method==="resources")return client.listResourcesPage(p.cursor,{signal});
  if(method==="templates")return client.listResourceTemplatesPage(p.cursor,{signal});
  if(method==="read")return client.readResource(p.uri,{signal});
  throw new Error("Unsupported MCP host method");
}
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
lines.on("line",line=>{
  let request;try{if(Buffer.byteLength(line)>1024*1024)throw Error("Oversized request");request=JSON.parse(line);if(request.token!==token||!request.id)throw Error("Invalid MCP host identity")}catch{process.exit(2)}
  if(request.method==="cancel"){controllers.get(request.id)?.abort();return}
  const controller=new AbortController();controllers.set(request.id,controller);
  handle(request.method,request.params||{},controller.signal).then(result=>write({id:request.id,result})).catch(error=>write({id:request.id,error:String(error.message||error)})).finally(()=>controllers.delete(request.id));
});
lines.on("close",()=>{for(const c of controllers.values())c.abort();void client?.close().finally(()=>process.exit(0))});
