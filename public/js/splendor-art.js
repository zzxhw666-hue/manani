/* Generated illustration atlas manifest. IDs are stable across sessions and shuffles. */
(function(root){
'use strict';
const colors=['white','blue','green','red','black'];
const scenes=["山溪淘洗","白石采场","矿灯甬道","山腰矿车","地下晶洞","溪畔筛石","工棚分拣","石阶矿门","蓝湖码头","河畔水磨","帆船修造","渔港石桥","盐仓木栈","海边灯塔","雨夜船坞","山路驮队","松林营地","绿洲集市","丘陵牧道","古井驿站","山谷吊桥","密林遗迹","稻田渡口","铁匠炉火","铜器作坊","皮革铺面","陶窑工坊","染坊红布","蜡烛小店","面包石炉","小镇钟楼","石板巷道","杂货商店","河岸仓库","木桶庭院","葡萄酒窖","市集拱门","雨中货栈","旧城水井","石雕作坊","宝石切磨","珠宝称重","玻璃工房","金丝拉制","银器錾刻","藏书阁","绘图书房","商会账房","天文仪器","药草商馆","丝绸大厅","东方货栈","沙漠商队","水城运河","高桅商船","远航海图","深水港湾","山城商馆","跨河石桥","交易广场","翡翠花园","喷泉庭院","橘树长廊","大理石柱廊","雕像花坛","王室温室","宫廷织坊","宝石匣藏","象牙工艺","金银宝库","穹顶大教堂","海上要塞","临海宫殿","王城大门","山巅城堡","议会大厅","庆典广场","皇家图书馆","歌剧剧院","黄金王座","镜厅长廊","宫廷花宴","国王加冕","珠宝展厅","晨光圣坛","皇家庭园","穹顶观星台","国宴长桌","古城全景","繁荣海港"];
const nobleNames=['翡翠女公爵','红袍商会长','蓝衣女伯爵','白发学者','黑衣领主','珍珠夫人','金链银行家','绿袍使节','银冠公主','紫袍总督'];
function cardArt(id){
 let index,columns=5,rows=3,title;
 const match=/^s([123])-(white|blue|green|red|black)-(\d+)$/.exec(id);
 if(match){
  const tier=Number(match[1]),count=[0,8,6,4][tier],n=Number(match[3]);
  if(n<1||n>count)throw new RangeError('Unknown card artwork: '+id);
  index=[0,0,40,70][tier]+colors.indexOf(match[2])*count+n-1;
  title=scenes[index];
 }else{
  const noble=/^noble-(\d+)$/.exec(id);
  if(!noble||Number(noble[1])<1||Number(noble[1])>10)throw new RangeError('Unknown card artwork: '+id);
  index=Number(noble[1])-1;rows=2;title=nobleNames[index];
  return {id,title,src:'assets/table-club/cards/nobles.jpg',column:index%5,row:Math.floor(index/5),columns,rows};
 }
 return {id,title,src:'assets/table-club/cards/development-'+Math.floor(index/15)+'.jpg',column:index%15%5,row:Math.floor(index%15/5),columns,rows};
}
const api={cardArt,scenes,nobleNames};
root.SPLENDOR_ART=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
