/**
 * Print HTML without opening a popup tab.
 *
 * Chromium blocks the opener while a child window's print dialog is open, so
 * receipts that used window.open + print() froze the clinic app until that
 * page was closed. A hidden iframe prints in-place and is removed afterwards.
 */
const PRINT_DONE = "cad-print-done";

function injectPrintBootstrap(html: string, token: string): string {
  const bootstrap = `<script>
(function(){
  var token=${JSON.stringify(token)};
  var started=false;
  var finished=false;
  function done(){
    if(finished) return;
    finished=true;
    try{parent.postMessage({type:${JSON.stringify(PRINT_DONE)},token:token},"*");}catch(e){}
  }
  function go(){
    if(started) return;
    started=true;
    window.addEventListener("afterprint",done,{once:true});
    setTimeout(done,180000);
    try{window.print();}catch(e){done();}
  }
  function start(){
    var imgs=Array.prototype.slice.call(document.images||[]);
    var pending=imgs.filter(function(img){return !img.complete;});
    if(!pending.length){setTimeout(go,80);return;}
    var left=pending.length;
    var armed=false;
    function one(){
      left--;
      if(left<=0 && !armed){armed=true;setTimeout(go,80);}
    }
    pending.forEach(function(img){
      img.addEventListener("load",one,{once:true});
      img.addEventListener("error",one,{once:true});
    });
    setTimeout(function(){if(!started) go();},2500);
  }
  if(document.readyState==="complete") start();
  else window.addEventListener("load",start);
})();
</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${bootstrap}</body>`);
  }
  return `${html}${bootstrap}`;
}

export function printHtmlDocument(html: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const token = `p${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "Print";
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";

  const cleanup = () => {
    window.removeEventListener("message", onMessage);
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; token?: string } | null;
    if (!data || data.type !== PRINT_DONE || data.token !== token) return;
    cleanup();
  };

  window.addEventListener("message", onMessage);
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    cleanup();
    return;
  }
  doc.open();
  doc.write(injectPrintBootstrap(html, token));
  doc.close();

  window.setTimeout(cleanup, 180000);
}
