# Third-Party Notices

This prototype uses these permissively licensed open-source dependencies:

- [three.js](https://github.com/mrdoob/three.js) - MIT License
- [react-three-fiber](https://github.com/pmndrs/react-three-fiber) - MIT License
- [react-three-rapier](https://github.com/pmndrs/react-three-rapier) - MIT License
- [Rapier](https://github.com/dimforge/rapier) - Apache-2.0 License
- [Colyseus](https://github.com/colyseus/colyseus) - MIT License
- [Zustand](https://github.com/pmndrs/zustand) - MIT License
- [Lucide](https://github.com/lucide-icons/lucide) - ISC License

Each dependency is installed through its package distribution and retains its corresponding license information.

## Browser Shooter-derived combat code

[`server/combat.mjs`](server/combat.mjs) adapts the MIT-licensed weapon state-machine structure and player-raycast approach from [vkopitsa/browser-shooter](https://github.com/vkopitsa/browser-shooter), specifically `src/weapons/Weapon.ts` and `src/session/PlayerHit.ts`. [`src/game/interpolation.ts`](src/game/interpolation.ts) adapts its remote snapshot buffer approach from `src/net/RemotePlayer.ts`. Its full MIT license is preserved in [`licenses/browser-shooter-MIT.txt`](licenses/browser-shooter-MIT.txt).
