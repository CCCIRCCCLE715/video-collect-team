// Keep one visible copy of each liked video across member and weekly snapshots.
export function favoriteRows(catalog,favorites,userId=null){
 const active=catalog.filter(x=>!x.deleted_at),byId=new Map(active.map(x=>[x.id,x])),byTopic=new Map();
 for(const row of active)if(!byTopic.has(row.topic_id))byTopic.set(row.topic_id,row);
 return favorites.filter(f=>!userId||f.user_id===userId).map(f=>byId.get(f.entry_id)||byTopic.get(f.topic_id)).filter(Boolean);
}
