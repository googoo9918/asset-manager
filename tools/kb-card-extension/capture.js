// Self-contained: Chrome serializes this function into the active tab's isolated world.
function captureKbTables() {
  if(location.protocol!=='https:' || !(location.hostname==='card.kbcard.com'||location.hostname.endsWith('.kbcard.com'))) throw new Error('KB국민카드 조회 화면에서 실행해주세요.');
  const tables=[];
  let inaccessibleFrames=0;
  const read=doc=>{
    for(const table of doc.querySelectorAll('table')) {
      const win=doc.defaultView,style=win.getComputedStyle(table);
      if(!table.getClientRects().length||style.visibility==='hidden'||style.display==='none')continue;
      const rows=Array.from(table.rows).filter(r=>r.getClientRects().length&&win.getComputedStyle(r).visibility!=='hidden').map(row=>Array.from(row.cells).map(cell=>cell.innerText.trim()));
      if(rows.length<2)continue;
      if(rows.length>2000||rows.some(r=>r.length>60||r.some(c=>c.length>1000)))throw new Error('표가 너무 큽니다. 조회 기간을 줄여주세요.');
      tables.push({name:table.querySelector('caption')?.textContent?.trim()||`조회 표 ${tables.length+1}`,rows});
    }
    for(const frame of doc.querySelectorAll('iframe,frame')) {
      try { if(frame.contentDocument)read(frame.contentDocument);else inaccessibleFrames++; }
      catch { inaccessibleFrames++; }
    }
  };
  read(document);
  return {tables,inaccessibleFrames};
}
