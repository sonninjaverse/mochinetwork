/**
 * The branded moment while the app boots.
 *
 * The mark is inline SVG in the server-rendered HTML and the styles live in
 * the base sheet, so it paints with the first frame — no request for a logo
 * file, no font to wait for. The script is what takes it down: shortly after
 * the document has parsed, with a floor so it does not blink, and with a hard
 * ceiling so no slow resource can ever trap the app behind it.
 */

export const SPLASH_ID = "mochi-splash";

const FLOOR_MS = 300;
const CEILING_MS = 4000;
const FADE_MS = 420;

export const SPLASH_SCRIPT = `(function(){try{
var el=document.getElementById("${SPLASH_ID}");
if(!el)return;
var gone=false;
function hide(){
  if(gone)return;gone=true;
  el.className+=" is-done";
  setTimeout(function(){el.style.display="none";},${FADE_MS});
}
function schedule(){
  setTimeout(hide,${FLOOR_MS});
}
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",schedule);
}else{
  schedule();
}
setTimeout(hide,${CEILING_MS});
}catch(e){}})();`;
