export function relayFetch(address,token){
 const fetch=globalThis.fetch;
 return async(input,init)=>{
  const request=new Request(input,init),headers=new Headers({"X-Chela-Token":token,"X-Chela-Target":request.url,"X-Chela-Headers":JSON.stringify(Object.fromEntries(request.headers))});
  return fetch(address,{method:request.method,headers,body:["GET","HEAD"].includes(request.method)?undefined:request.body,signal:request.signal,redirect:"manual",duplex:"half"});
 };
}
