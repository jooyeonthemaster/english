import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const outputDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const data = JSON.parse(await fs.readFile(path.join(outputDir,'purchases.json'),'utf8'));
const canonical=JSON.stringify(data);let sourceHash=2166136261;for(let i=0;i<canonical.length;i++)sourceHash=Math.imul(sourceHash^canonical.charCodeAt(i),16777619);
if((sourceHash>>>0).toString(16)!=='d902a620')throw Error(`원본 화면 대조 불일치 ${(sourceHash>>>0).toString(16)}`);
const refundReceipts = {
 '25100177916697':['1677831122','RETURN'], '25100151245317':['1530854389','CANCEL'],
 '25100140166397':['1475434161','CANCEL'], '25100100165320':['1285503364','RETURN'],
 '25100090204531':['1243889856','RETURN'], '25100073261894':['1151410920','RETURN'],
 '25100054034648':['1065947960','RETURN']
};
const gross=data.reduce((s,d)=>s+d[2],0), refund=data.reduce((s,d)=>s+d[5],0);
if(data.length!==45 || new Set(data.map(d=>d[0])).size!==45) throw Error('주문 수/중복 불일치');
if(gross!==11462650 || refund!==6283100 || gross-refund!==5179550) throw Error('원본 합계 불일치');
for(const d of data) if(d[7].reduce((s,i)=>s+i[1]*i[2],0)+d[3]!==d[2]) throw Error(`상품 금액 대조 실패 ${d[0]}`);

const wb=Workbook.create();
const summary=wb.worksheets.add('요약');
const orders=wb.worksheets.add('주문별결제');
const items=wb.worksheets.add('상품내역');
const navy='#233C63', blue='#EEF3FA', gray='#58677A';
function base(sheet,area) { sheet.showGridLines=false; sheet.getRange(area).format.font={name:'Arial',size:11,color:'#243244'}; sheet.getRange(area).format.verticalAlignment='center'; sheet.getRange(area).format.rowHeight=25; }
function header(sheet,range) {sheet.getRange(range).format={fill:navy,font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:34,wrapText:true};}
function title(sheet,text,lastCol){sheet.getRange('A2').values=[[text]];sheet.getRange('A2').format.font={size:16,bold:true,color:navy};sheet.getRange(`A3:${lastCol}3`).format.borders={bottom:{style:'thin',color:'#B7C5D8'}};}
function money(sheet,range){sheet.getRange(range).setNumberFormat('#,##0"원"');sheet.getRange(range).format.horizontalAlignment='right';}
function status(sheet,range){sheet.getRange(range).conditionalFormats.add('containsText',{text:'반품완료',format:{fill:'#FFF2DE',font:{color:'#875313'}}});sheet.getRange(range).conditionalFormats.add('containsText',{text:'취소완료',format:{fill:'#FFF2DE',font:{color:'#875313'}}});}

base(orders,'A1:L50');title(orders,'쿠팡 주문별 결제 내역','L');
orders.getRange('A4').values=[['출처: 로그인한 쿠팡 주문상세와 취소·반품 상세 화면. 2026-09-07 조회.']];
orders.getRange('A4:L4').format.font={size:10,color:gray,italic:true};
const oh=['주문일','연도','주문번호','상태','품목 수','결제표시액','환불완료액','차감 후 금액','최초 배송비','선물 포장비','주문상세 출처','환불상세 출처'];
orders.getRange('A6:L6').values=[oh];
const orderRows=data.map(d=>{const ref=refundReceipts[d[0]];return [new Date(d[1]+'T00:00:00Z'),Number(d[1].slice(0,4)),d[0],d[6],d[7].length,d[2],d[5],null,d[3],d[4],`https://mc.coupang.com/ssr/desktop/order/${d[0]}`,ref?`https://mc.coupang.com/ssr/desktop/cancel-return-exchange/detail?orderId=${d[0]}&receiptId=${ref[0]}&receiptType=${ref[1]}`:''];});
orders.getRange(`A7:L${6+data.length}`).values=orderRows;
orders.getRange('H7').formulas=[['=F7-G7']];orders.getRange(`H7:H${6+data.length}`).fillDown();
orders.getRange(`A7:A${6+data.length}`).setNumberFormat('yyyy-mm-dd');
orders.getRange(`C7:C${6+data.length}`).setNumberFormat('0');money(orders,`F7:J${6+data.length}`);
orders.getRange('A1:A51').format.columnWidth=14;orders.getRange('B1:B51').format.columnWidth=9;orders.getRange('C1:C51').format.columnWidth=21;orders.getRange('D1:D51').format.columnWidth=13;orders.getRange('E1:E51').format.columnWidth=10;orders.getRange('F1:J51').format.columnWidth=17;orders.getRange('K1:L51').format.columnWidth=70;
orders.tables.add(`A6:L${6+data.length}`,true,'Orders');header(orders,'A6:L6');status(orders,`D7:D${6+data.length}`);orders.freezePanes.freezeRows(6);orders.freezePanes.freezeColumns(3);

const itemRows=[];
for(const d of data)for(const i of d[7])itemRows.push([new Date(d[1]+'T00:00:00Z'),d[0],i[0],d[6],i[1],i[2],null,d[0]==='25100069848615'?'단가에 선물 포장비 1,500원 포함':d[0]==='25100151245317'?'결제실패로 자동취소':'']);
base(items,`A1:H${6+itemRows.length}`);title(items,'쿠팡 상품 내역','H');
items.getRange('A4').values=[['단가·수량은 주문 화면 기준. 배송비와 환불은 주문별결제에서 확인.']];items.getRange('A4:H4').format.font={size:10,color:gray,italic:true};
items.getRange('A6:H6').values=[['주문일','주문번호','상품 및 옵션','상태','표시 단가','주문 수량','표시금액 × 수량','비고']];
items.getRange(`A7:H${6+itemRows.length}`).values=itemRows;items.getRange('G7').formulas=[['=E7*F7']];items.getRange(`G7:G${6+itemRows.length}`).fillDown();
items.getRange(`A7:A${6+itemRows.length}`).setNumberFormat('yyyy-mm-dd');items.getRange(`B7:B${6+itemRows.length}`).setNumberFormat('0');money(items,`E7:E${6+itemRows.length}`);money(items,`G7:G${6+itemRows.length}`);
items.getRange(`A1:A${6+itemRows.length}`).format.columnWidth=14;items.getRange(`B1:B${6+itemRows.length}`).format.columnWidth=21;items.getRange(`C1:C${6+itemRows.length}`).format.columnWidth=80;items.getRange(`D1:G${6+itemRows.length}`).format.columnWidth=17;items.getRange(`H1:H${6+itemRows.length}`).format.columnWidth=42;
items.getRange(`C7:C${6+itemRows.length}`).format.wrapText=true;items.getRange(`H7:H${6+itemRows.length}`).format.wrapText=true;
itemRows.forEach((r,i)=>{items.getRange(`A${i+7}:H${i+7}`).format.rowHeight=Math.max(38,Math.ceil(r[2].length/43)*18+10);});
items.tables.add(`A6:H${6+itemRows.length}`,true,'PurchasedItems');header(items,'A6:H6');status(items,`D7:D${6+itemRows.length}`);items.freezePanes.freezeRows(6);items.freezePanes.freezeColumns(2);

base(summary,'A1:G29');title(summary,'쿠팡 구매내역 — 확인된 45건','G');summary.tabColor=navy;
summary.getRange('A4').values=[['전체 누적액 미확정: 쿠팡 접근 제한으로 2024년 일부와 이전 연도는 미조회.']];summary.getRange('A4:G4').format.font={size:11,color:'#9A5100'};
summary.getRange('A6').values=[['환불 차감 후 확인 금액']];summary.getRange('C6').formulas=[["=SUM('주문별결제'!H7:H51)"]];money(summary,'C6');summary.getRange('A6:C6').format.font={size:16,bold:true,color:navy};summary.getRange('A6:G6').format.rowHeight=32;
summary.getRange('A9:F9').values=[['연도','조회 상태','주문 수','결제표시액','환불완료액','차감 후 금액']];header(summary,'A9:F9');
const yearRows=[[2026,'현재까지 전체',null,null,null,null],[2025,'연간 전체',null,null,null,null],[2024,'일부 (4/23~12/18)',null,null,null,null],[2023,'미조회',null,null,null,null],[2022,'미조회',null,null,null,null],[2021,'미조회',null,null,null,null]];
summary.getRange('A10:F15').values=yearRows;
for(let r=10;r<=12;r++)summary.getRange(`C${r}:F${r}`).formulas=[[`=COUNTIFS('주문별결제'!$B$7:$B$51,A${r})`,`=SUMIFS('주문별결제'!$F$7:$F$51,'주문별결제'!$B$7:$B$51,A${r})`,`=SUMIFS('주문별결제'!$G$7:$G$51,'주문별결제'!$B$7:$B$51,A${r})`,`=SUMIFS('주문별결제'!$H$7:$H$51,'주문별결제'!$B$7:$B$51,A${r})`]];
summary.getRange('A16').values=[['확인분 합계']];summary.getRange('C16:F16').formulas=[['=SUM(C10:C12)','=SUM(D10:D12)','=SUM(E10:E12)','=SUM(F10:F12)']];summary.getRange('A16:F16').format.fill=blue;summary.getRange('A16:F16').format.font.bold=true;money(summary,'D10:F16');
summary.getRange('A19').values=[['계산 기준']];summary.getRange('A19').format.font.bold=true;
summary.getRange('A20').values=[['결제표시액은 주문상세의 금액이며, 결제실패 자동취소 주문도 포함됩니다.']];
summary.getRange('A21').values=[['차감 후 금액 = 결제표시액 − 쿠팡 상세에 표시된 환불완료액.']];
summary.getRange('A22').values=[['배송비·선물 포장비를 포함합니다. 별도 멤버십 회비·쿠팡이츠 등은 대상이 아닙니다.']];
summary.getRange('A23').values=[['화병 반품: 결제 47,000원 − 환불 40,500원 = 남은 배송·반품 비용 6,500원.']];
summary.getRange('A24').values=[['수량은 주문한 묶음 수입니다. 상품명 속 구성품 수량과 별도로 보세요.']];
summary.getRange('A25').values=[['주문목록에서 삭제된 과거 내역은 확인할 수 없으며, 미조회 기간을 0원으로 처리하지 않았습니다.']];
summary.getRange('A27').values=[['조회 기준일: 2026-09-07. 현재 확인 범위: 2024-04-23 ~ 2026-08-27.']];summary.getRange('A27:G27').format.font={size:10,color:gray,italic:true};
summary.getRange('A1:A29').format.columnWidth=16;summary.getRange('B1:B29').format.columnWidth=26;summary.getRange('C1:C29').format.columnWidth=20;summary.getRange('D1:F29').format.columnWidth=19;summary.getRange('G1:G29').format.columnWidth=12;

wb.recalculate();
console.log((await wb.inspect({kind:'table',range:'요약!A9:F16',include:'values,formulas',tableMaxRows:8,tableMaxCols:6,maxChars:4000})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!',options:{useRegex:true,maxResults:20},summary:'Formula errors'})).ndjson);
const output=await SpreadsheetFile.exportXlsx(wb);await output.save(path.join(outputDir,'쿠팡_구매내역_확인분.xlsx'));
for(const [name,range,file] of [['요약','A1:G28','summary.png'],['주문별결제','A1:J12','orders.png'],['상품내역','A1:H13','items.png']]){
 const blob=await wb.render({sheetName:name,range,scale:1.5,format:'png'});await fs.writeFile(path.join(outputDir,file),new Uint8Array(await blob.arrayBuffer()));
}
console.log(JSON.stringify({orders:data.length,itemRows:itemRows.length,gross,refund,net:gross-refund,output:path.join(outputDir,'쿠팡_구매내역_확인분.xlsx')}));


