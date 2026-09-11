// Static demonstration fixtures; each view exposes only that seat's reserved faces.
export const gemNames = ['white', 'blue', 'green', 'red', 'black', 'gold'];
export const seats = [
  { id: 'lin', name: '林小雨', score: 8, tokens: [2,3,2,1,0,1], bonuses: [1,1,1,1,0], reserved: [{color:'green',points:2,seed:5}] },
  { id: 'zhou', name: '老周', score: 6, tokens: [1,2,0,2,1,0], bonuses: [1,2,0,2,1], reserved: [{color:'blue',points:3,seed:3},{color:'white',points:1,seed:6}] },
  { id: 'kai', name: '阿凯', score: 4, tokens: [0,1,2,2,1,0], bonuses: [0,1,2,2,1], reserved: [] },
  { id: 'an', name: '安然', score: 5, tokens: [2,0,1,1,2,1], bonuses: [2,0,1,1,2], reserved: [{color:'red',points:4,seed:4}] }
];
export function perspective(id) {
  const index = seats.findIndex(player => player.id === id);
  if (index < 0) throw new RangeError('Unknown demonstration seat');
  const self = structuredClone(seats[index]);
  const opponents = [1,2,3].map(offset => {
    const { reserved, ...publicPlayer } = seats[(index + offset) % seats.length];
    return { ...structuredClone(publicPlayer), reservedCount: reserved.length };
  });
  return { self, opponents, isMyTurn: id === 'lin' };
}
