/**
 * 小小CSGO 升级版 V3 - 地图数据模块（src/maps.js）
 *
 * 文件归属：V3-地图
 * 数据基准：index.html 的 WORLD / MAP 结构。
 *
 * 坐标系约定与 index.html 完全一致：
 *   - 世界尺寸 = half * 2 米，原点在地图中心，X 向东、Z 向南；
 *   - box 的 (x, y, z) 是底面中心，y 为底面高度；
 *   - 路线为可循环的 [x, z] 航点数组；
 *   - floorY 表示该路线所在平面的站立高度（0 为地面）。
 *
 * 本文件不依赖 three.js、不操作 DOM，浏览器与 Node 均可直接加载。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var SCHEMA_VERSION = 'v1';
  var PI_2 = Math.PI / 2;

  var DEFAULT_ENEMY_NAMES = [
    'VIPER', 'GHOST', 'REAPER', 'HAVOC', 'STRIKER',
    'COBRA', 'TALON', 'WOLF', 'DIESEL', 'SHADOW'
  ];

  /* 通用几何：与 index.html 中 box() / instancedByColor() 的尺寸对齐。 */
  var PRIMITIVES = {
    container: { w: 2.7, h: 2.85, d: 9.0, mat: 'container', minimap: '#5a6068' },
    crate:     { w: 1.25, h: 1.25, d: 1.25, mat: 'crate', minimap: '#4a4238' },
    barrel:    { w: 0.76, h: 0.95, d: 0.76, mat: 'barrel', minimap: '#4a4a48' },
    jersey:    { w: 2.5, h: 1.05, d: 0.55, mat: 'concrete', minimap: '#4e555c' }
  };

  /* 数据简写：把长条数据展开成标准 cover 条目。 */
  function B(w, h, d, x, y, z, mat, opt) {
    return Object.assign({ shape: 'box', w: w, h: h, d: d, x: x, y: y || 0, z: z, mat: mat }, opt || {});
  }
  function CT(x, y, z, rotY, color) {
    return { shape: 'container', x: x, y: y || 0, z: z, rotY: rotY || 0, color: color };
  }
  function CR(x, y, z, rotY) {
    return { shape: 'crate', x: x, y: y || 0, z: z, rotY: rotY || 0 };
  }
  function BR(x, y, z) {
    return { shape: 'barrel', x: x, y: y || 0, z: z };
  }
  function JB(x, z, rotY) {
    return { shape: 'jersey', x: x, z: z, rotY: rotY || 0 };
  }

  var maps = [
    /* =====================================================================
     * 集装箱仓库（原图，SECTOR 7）
     * =================================================================== */
    {
      id: 'sector7',
      name: '集装箱仓库',
      codename: 'SECTOR 7',
      subtitle: 'WAREHOUSE DISTRICT',
      half: 30,
      theme: {
        sky: 'industrial-dusk',
        fogColor: '#5a6872',
        fogDensity: 0.014,
        sunColor: '#ffd9a0',
        sunDirection: [0.55, 0.72, 0.42],
        ambient: '#9aa8b2',
        minimapBg: 'rgba(8,12,16,.82)',
        gridColor: 'rgba(120,140,160,.10)'
      },
      perimeter: { wallHeight: 12, thickness: 1.2, fenceHeight: 3.3 },
      playerSpawns: [
        { id: 'south-gate', label: '南门', x: 0, z: 24, yaw: 0, floorY: 0 },
        { id: 'east-gate', label: '东门', x: 20, z: 26, yaw: -PI_2, floorY: 0 }
      ],
      defaultSpawn: 0,
      enemies: {
        count: 10,
        names: DEFAULT_ENEMY_NAMES.slice(),
        grace: 3.0,
        spawns: [
          { routeIndex: 0, x: 16, z: -24, floorY: 0, label: '北走廊入口' },
          { routeIndex: 1, x: -26, z: -6, floorY: 4.42, label: '二层西北' },
          { routeIndex: 2, x: 0, z: -10, floorY: 0, label: '中央废车区' },
          { routeIndex: 3, x: 2, z: 16, floorY: 0, label: '东南货场' },
          { routeIndex: 4, x: -4, z: -25, floorY: 0, label: '北侧通道' },
          { routeIndex: 5, x: 18, z: -25, floorY: 0, label: '岗亭北侧' },
          { routeIndex: 6, x: -24, z: 2, floorY: 4.42, label: '二层西南' },
          { routeIndex: 7, x: -16, z: 20, floorY: 0, label: '南侧开阔地' },
          { routeIndex: 8, x: -19, z: 2, floorY: 0, label: '西侧货场' },
          { routeIndex: 9, x: 8, z: -14, floorY: 0, label: '北区游走' }
        ]
      },
      routes: [
        { id: 'corridor-ns', label: '北南集装箱走廊', floorY: 0, enemyIndexes: [0], waypoints: [[16,-22],[16,-14],[16,-6],[16,4],[16,12],[16,20]] },
        { id: 'warehouse-deck-1', label: '仓库二层（西）', floorY: 4.42, enemyIndexes: [1], waypoints: [[-22,-10],[-20,-4],[-18,0],[-22,3],[-26,-6]] },
        { id: 'center-wreck', label: '中央废车区', floorY: 0, enemyIndexes: [2], waypoints: [[-2,6],[-1,2],[5,-4],[2,-8],[0,-10],[-5,-2]] },
        { id: 'southeast-yard', label: '东南货场', floorY: 0, enemyIndexes: [3], waypoints: [[16,20],[10,19],[8,22],[2,16],[10,10]] },
        { id: 'north-strip', label: '北侧通道', floorY: 0, enemyIndexes: [4], waypoints: [[-14,-22],[-10,-23],[-4,-25],[4,-20],[-6,-16]] },
        { id: 'guard-shack', label: '岗亭环路', floorY: 0, enemyIndexes: [5], waypoints: [[24,-8],[24,-18],[22,-14],[18,-22],[20,-10]] },
        { id: 'warehouse-deck-2', label: '仓库二层（东）', floorY: 4.42, enemyIndexes: [6], waypoints: [[-20,-6],[-24,2],[-18,4],[-18,1],[-16,-4]] },
        { id: 'south-open', label: '南侧开阔地', floorY: 0, enemyIndexes: [7], waypoints: [[-6,20],[-14,20],[2,24],[-10,26],[-16,20]] },
        { id: 'west-yard', label: '西侧货场', floorY: 0, enemyIndexes: [8], waypoints: [[-14,10],[-9,8],[-6,12],[-10,4],[-16,2]] },
        { id: 'roamer', label: '游走巡逻', floorY: 0, enemyIndexes: [9], waypoints: [[8,-14],[11,-4],[2,-6],[4,2],[10,2],[14,-10]] }
      ],
      cover: [
        /* 二层仓库建筑（西侧，狙击平台） */
        B(0.6, 9.5, 20.6, -29, 0, -4, 'wall', { uvScale: [5.2, 2.4], minimap: { color: '#3b4147' } }),
        B(14.6, 9.5, 0.6, -22, 0, -14, 'wall', { uvScale: [3.7, 2.4], minimap: { color: '#3b4147' } }),
        B(6.2, 9.5, 0.6, -25.6, 0, 6, 'wall', { uvScale: [1.6, 2.4], minimap: { color: '#3b4147' } }),
        B(0.7, 4.0, 0.7, -15.5, 0, -11.6, 'concrete', { uvScale: [0.2, 1], minimap: { color: '#3b4147' } }),
        B(0.7, 4.0, 0.7, -15.5, 0, -7.2, 'concrete', { uvScale: [0.2, 1], minimap: { color: '#3b4147' } }),
        B(0.7, 4.0, 0.7, -15.5, 0, -2.8, 'concrete', { uvScale: [0.2, 1], minimap: { color: '#3b4147' } }),
        B(0.7, 4.0, 0.7, -15.5, 0, 1.6, 'concrete', { uvScale: [0.2, 1], minimap: { color: '#3b4147' } }),
        B(0.7, 4.0, 0.7, -25.5, 0, 5.4, 'concrete', { uvScale: [0.2, 1] }),
        B(14, 0.42, 20, -22, 4.0, -4, 'concrete', { collide: false, ground: true, ceiling: true, uvScale: [3.5, 5.0], minimap: { color: '#4a525a' } }),
        /* 二层护栏 + 沙袋掩体 */
        B(7.5, 1.05, 0.24, -25.25, 4.42, 5.85, 'darkMetal', { minimap: { color: '#4a525a' } }),
        B(1.7, 1.05, 0.24, -15.85, 4.42, 5.85, 'darkMetal', { minimap: { color: '#4a525a' } }),
        B(0.24, 1.05, 12.0, -15.15, 4.42, -7.6, 'darkMetal', { minimap: { color: '#4a525a' } }),
        B(0.24, 1.05, 4.4, -15.15, 4.42, 3.6, 'darkMetal', { minimap: { color: '#4a525a' } }),
        B(2.6, 0.95, 0.5, -17.2, 4.42, -11.0, 'rust', { minimap: { color: '#4a525a' } }),
        B(0.5, 0.95, 2.4, -19.6, 4.42, -6.6, 'rust', { minimap: { color: '#4a525a' } }),
        /* 二层上层墙体 + 屋顶 */
        B(0.6, 5.0, 20.6, -29, 4.42, -4, 'wall', { uvScale: [5.2, 1.25] }),
        B(14.6, 5.0, 0.6, -22, 4.42, -14, 'wall', { uvScale: [3.7, 1.25] }),
        B(0.5, 3.4, 0.5, -21.8, 4.42, -12.0, 'concrete', { uvScale: [0.15, 0.85] }),
        B(0.5, 3.4, 0.5, -21.8, 4.42, -7.8, 'concrete', { uvScale: [0.15, 0.85] }),
        B(0.5, 3.4, 0.5, -21.8, 4.42, -3.6, 'concrete', { uvScale: [0.15, 0.85] }),
        B(0.5, 3.4, 0.5, -21.8, 4.42, 0.6, 'concrete', { uvScale: [0.15, 0.85] }),
        B(8.0, 0.4, 20.4, -25.1, 7.82, -4, 'concrete', { collide: false, ground: true, uvScale: [2, 5.1] }),
        /* 西墙窗口（纯装饰，无碰撞） */
        B(0.9, 1.5, 1.7, -28.65, 5.6, -11, 'glassBroke', { collide: false, solid: false }),
        B(0.9, 1.5, 1.7, -28.65, 5.6, -7, 'glassBroke', { collide: false, solid: false }),
        B(0.9, 1.5, 1.7, -28.65, 5.6, -3, 'glassBroke', { collide: false, solid: false }),
        /* 中部长隔墙（带缺口） */
        B(0.6, 3.6, 9.0, -8.0, 0, -20.0, 'wall', { uvScale: [3, 1.5], minimap: { color: '#3b4147' } }),
        B(0.6, 3.6, 6.0, -8.0, 0, -8.0, 'wall', { uvScale: [2, 1.5], minimap: { color: '#3b4147' } }),
        B(0.6, 1.1, 3.2, -8.0, 0, -14.0, 'concrete', { uvScale: [1, 0.5], minimap: { color: '#3b4147' } }),
        /* 东北岗亭 */
        B(6.4, 0.25, 6.4, 25, 0, -14, 'concrete', { uvScale: [2, 2], collide: false, ground: true }),
        B(6.4, 3.2, 0.35, 25, 0.25, -17, 'wall', { uvScale: [2, 1], minimap: { color: '#3b4147' } }),
        B(0.35, 3.2, 6.4, 22, 0.25, -14, 'wall', { uvScale: [2, 1], minimap: { color: '#3b4147' } }),
        B(0.35, 3.2, 6.4, 28, 0.25, -14, 'wall', { uvScale: [2, 1], minimap: { color: '#3b4147' } }),
        B(2.0, 3.2, 0.35, 22.8, 0.25, -11, 'wall', { uvScale: [0.8, 1], minimap: { color: '#3b4147' } }),
        B(6.6, 0.3, 6.6, 25, 3.45, -14, 'darkMetal', { collide: false, ground: true, ceiling: true }),
        B(2.4, 1.4, 0.2, 26.2, 1.5, -11, 'glassBroke', { collide: false, solid: false }),
        /* 中央烧毁平板车（三块轴对齐碰撞盒，与原图 hull 一致） */
        B(3.853, 1.05, 3.474, -0.436, 0, -1.082, 'charred', { ground: true, minimap: { color: '#4a4038' } }),
        B(2.636, 1.72, 2.711, 1.481, 0, -2.438, 'charred', { minimap: { color: '#4a4038' } }),
        B(1.957, 1.25, 1.836, 2.897, 0, -2.826, 'charred', { minimap: { color: '#4a4038' } }),
        /* 集装箱（双走廊 + 堆叠 + 散落） */
        CT(12.6, 0, -19, 0, '#a85748'),
        CT(12.6, 0, -9.4, 0, '#53718c'),
        CT(12.6, 0, 0.2, 0, '#707f56'),
        CT(12.6, 0, 9.8, 0, '#ab8a3f'),
        CT(12.6, 0, 19.4, 0, '#8b9096'),
        CT(19.4, 0, -19, 0, '#7e5243'),
        CT(19.4, 0, -9.4, 0, '#4f6f69'),
        CT(19.4, 0, 0.2, 0, '#a85748'),
        CT(19.4, 0, 9.8, 0, '#53718c'),
        CT(19.4, 0, 19.4, 0, '#707f56'),
        CT(19.4, 2.85, -9.4, PI_2, '#ab8a3f'),
        CT(19.4, 2.85, 9.8, 0, '#8b9096'),
        CT(12.6, 2.85, 0.2, PI_2, '#7e5243'),
        CT(-4.5, 0, -21.5, PI_2, '#4f6f69'),
        CT(2.0, 0, -25.0, 0, '#a85748'),
        CT(-11.0, 0, -4.0, PI_2, '#53718c'),
        CT(26.0, 0, -3.0, 0, '#707f56'),
        CT(25.4, 0, 6.5, PI_2, '#ab8a3f'),
        CT(4.5, 0, 17.0, 0, '#8b9096'),
        CT(-8.5, 0, 22.0, PI_2, '#7e5243'),
        CT(24.5, 0, 22.5, 0, '#4f6f69'),
        CT(12.6, 2.85, -19, 0, '#4f6f69'),
        CT(12.6, 2.85, 9.8, 0, '#a85748'),
        CT(19.4, 2.85, -19, 0, '#53718c'),
        CT(19.4, 2.85, 19.4, 0, '#707f56'),
        CT(-18.0, 0, -24.0, 0, '#8b9096'),
        CT(-23.0, 0, -10.0, PI_2, '#7e5243'),
        CT(8.0, 0, -25.0, PI_2, '#4f6f69'),
        CT(-17.0, 0, 26.0, PI_2, '#7e5243'),
        CT(-25.0, 0, -4.0, 0, '#a85748'),
        /* 混凝土隔离墩 */
        JB(-2, -8, 0), JB(1.2, -8, 0),
        JB(6.5, 4.5, PI_2), JB(6.5, 7.4, PI_2),
        JB(-16, 18, 0), JB(-13, 18, 0),
        JB(9.5, -15, PI_2), JB(9.5, -12.2, PI_2),
        JB(-24, -22, 0), JB(-21, -22, 0),
        JB(17, -26, 0), JB(20, -26, 0),
        JB(18, 14, 0), JB(25, 14, 0),
        JB(-12, 24, 0), JB(10, 24, 0),
        JB(-20, 6, 0), JB(-17, 6, 0),
        JB(-6, 10, PI_2), JB(-6, 13, PI_2),
        /* 木箱堆（固定散布） */
        CR(-3.2, 0, -3.4, 0.3), CR(-4.1, 0, -2.6, 0.8), CR(-3.1, 0, -2.3, 1.1), CR(-3.6, 1.25, -2.9, 0.5),
        CR(16.2, 0, 4.3, 0.5), CR(16.8, 0, 4.9, 1.2),
        CR(15.6, 0, -5.4, 0.2), CR(16.4, 0, -4.8, 0.7),
        CR(-13.4, 0, 9.7, 0.4), CR(-12.6, 0, 10.3, 1.0), CR(-13.0, 1.25, 10.0, 0.6),
        CR(7.8, 0, -20.5, 0.3), CR(8.5, 0, -19.6, 0.9),
        CR(21.6, 0, 14.2, 0.6), CR(22.5, 0, 13.6, 1.2),
        CR(2.7, 0, 25.7, 0.4), CR(3.4, 0, 26.4, 0.8),
        CR(-25.8, 0, 23.7, 0.6), CR(-25.1, 0, 24.4, 1.2),
        CR(26.6, 0, -24.3, 0.3), CR(27.5, 0, -23.7, 0.9),
        CR(-2.3, 0, 11.7, 0.5), CR(-1.6, 0, 12.4, 1.1),
        CR(15.7, 0, -22.4, 0.4), CR(16.5, 0, -21.6, 0.9),
        CR(-7.5, 0, -2.5, 0.6), CR(-6.7, 0, -3.3, 0.2),
        CR(10.3, 0, 14.4, 0.5), CR(11.1, 0, 15.2, 0.9),
        CR(-19.5, 0, -4.5, 0.3), CR(-18.7, 0, -5.3, 0.7),
        CR(2.2, 0, 4.6, 0.8), CR(3.0, 0, 5.4, 0.4),
        CR(26.4, 0, 12.4, 0.6), CR(27.2, 0, 13.2, 0.2),
        CR(20.2, 1.5, 5.2, 0.4), CR(24.4, 1.5, 4.2, 0.9),
        /* 油桶堆 */
        BR(6.5, 0, -12.5), BR(6.95, 0, -12.2), BR(6.15, 0, -12.1), BR(6.6, 0.95, -12.4),
        BR(-6.0, 0, 14.0), BR(-5.6, 0, 14.3), BR(-6.45, 0, 14.25),
        BR(8.5, 0, 16.5), BR(8.9, 0, 16.2), BR(8.15, 0, 16.6), BR(8.5, 0.95, 16.5),
        BR(-10.5, 0, -20.5), BR(-10.1, 0, -20.2), BR(-11.0, 0, -20.3),
        BR(24.0, 0, -24.5), BR(24.4, 0, -24.2), BR(23.6, 0, -24.3), BR(24.0, 0.95, -24.5),
        BR(2.0, 0, 22.0), BR(2.4, 0, 22.3), BR(1.6, 0, 22.2),
        BR(-17.0, 0, 2.0), BR(-16.6, 0, 2.3), BR(-17.45, 0, 2.25),
        BR(13.5, 0, -2.5), BR(13.9, 0, -2.2), BR(13.1, 0, -2.3), BR(13.5, 0.95, -2.5),
        BR(21.0, 0, 10.0), BR(21.4, 0, 10.3), BR(20.6, 0, 10.2),
        BR(-24.5, 0, 16.5), BR(-24.1, 0, 16.8), BR(-24.9, 0, 16.7),
        BR(3.0, 0, 10.0), BR(3.4, 0, 10.3), BR(2.6, 0, 10.4),
        BR(16.8, 0, 4.5), BR(17.2, 0, 4.8), BR(16.4, 0, 4.9),
        BR(-26.5, 0, 8.5), BR(-26.1, 0, 8.8), BR(-26.9, 0, 8.9),
        BR(20.4, 1.5, 8.6), BR(20.8, 1.5, 8.9), BR(20.0, 1.5, 9.0),
        /* 东侧装卸平台（1.5m 高低差） */
        B(8, 0.4, 9, 22, 1.5, 6.5, 'concrete', { collide: false, ground: true, ceiling: false, minimap: { color: '#4a525a' } }),
        B(8, 1.0, 0.22, 22, 1.5, 2.05, 'darkMetal', { minimap: { color: '#4a525a' } }),
        B(0.22, 1.0, 9, 26.05, 1.5, 6.5, 'darkMetal', { minimap: { color: '#4a525a' } }),
        B(2.6, 0.9, 0.5, 19.8, 1.5, 3.2, 'rust', { minimap: { color: '#4a525a' } }),
        B(0.5, 0.9, 2.4, 24.2, 1.5, 9.8, 'rust', { minimap: { color: '#4a525a' } })
      ],
      ramps: [
        {
          id: 'warehouse-ramp',
          label: '仓库二层坡道',
          x: -21.2, z: 15.2, width: 4.2, length: 9.5, baseY: 0, topY: 4.42,
          direction: '-Z',
          minimap: { w: 4.2, d: 9.5, color: '#5d666e' },
          sideWalls: [
            B(0.26, 4.72, 9.5, -21.32, 0, 10.45, 'concrete'),
            B(0.26, 4.72, 9.5, -16.88, 0, 10.45, 'concrete'),
            B(4.2, 4.2, 0.3, -19.1, 0, 5.85, 'concrete')
          ]
        },
        {
          id: 'east-loading-ramp',
          label: '东侧装卸平台坡道',
          x: 22, z: 13, width: 4, length: 5, baseY: 0, topY: 1.5,
          direction: '-Z',
          minimap: { w: 4, d: 5, color: '#5d666e' },
          sideWalls: [
            B(0.26, 1.8, 5, 20.0, 0, 13, 'concrete'),
            B(0.26, 1.8, 5, 24.0, 0, 13, 'concrete')
          ]
        }
      ]
    },

    /* =====================================================================
     * 霓虹码头（新图）
     * =================================================================== */
    {
      id: 'neon-dock',
      name: '霓虹码头',
      codename: 'NEON DOCK',
      subtitle: 'NIGHT HARBOR YARD',
      half: 30,
      theme: {
        sky: 'neon-night',
        fogColor: '#0b1620',
        fogDensity: 0.012,
        sunColor: '#9fd8ff',
        sunDirection: [-0.45, 0.28, 0.62],
        ambient: '#22313f',
        minimapBg: 'rgba(4,8,14,.86)',
        gridColor: 'rgba(96,220,255,.10)'
      },
      perimeter: { wallHeight: 12, thickness: 1.2, fenceHeight: 3.3 },
      playerSpawns: [
        { id: 'south-gate', label: '南岸入口', x: 0, z: 24, yaw: 0, floorY: 0 },
        { id: 'east-gate', label: '东侧码头入口', x: 27, z: 18, yaw: -PI_2, floorY: 0 }
      ],
      defaultSpawn: 0,
      enemies: {
        count: 10,
        names: DEFAULT_ENEMY_NAMES.slice(),
        grace: 3.0,
        spawns: [
          { routeIndex: 0, x: 6, z: -20, floorY: 0, label: '走廊北端' },
          { routeIndex: 1, x: -26, z: 2, floorY: 1.8, label: '平台西北' },
          { routeIndex: 2, x: 20, z: -6, floorY: 0, label: '东侧货场' },
          { routeIndex: 3, x: -12, z: -22, floorY: 0, label: '北岸栈道' },
          { routeIndex: 4, x: -28, z: -14, floorY: 0, label: '仓库西北' },
          { routeIndex: 5, x: 18, z: -16, floorY: 0, label: '起重机北侧' },
          { routeIndex: 6, x: -26, z: 0, floorY: 1.8, label: '平台西南' },
          { routeIndex: 7, x: -18, z: 23, floorY: 0, label: '西南货堆' },
          { routeIndex: 8, x: -16, z: 12, floorY: 0, label: '中西部' },
          { routeIndex: 9, x: 10, z: -10, floorY: 0, label: '北区游走' }
        ]
      },
      routes: [
        { id: 'central-lane', label: '中央集装箱走廊', floorY: 0, enemyIndexes: [0], waypoints: [[6,-20],[6,-14],[6,-8],[6,2],[6,10],[6,16]] },
        { id: 'platform-west', label: '装卸平台（西）', floorY: 1.8, enemyIndexes: [1], waypoints: [[-26,2],[-23,4],[-20,4],[-22,7],[-26,3]] },
        { id: 'east-yard', label: '东侧货场', floorY: 0, enemyIndexes: [2], waypoints: [[20,18],[24,14],[24,8],[22,0],[20,-6],[16,2]] },
        { id: 'seawall', label: '北岸栈道', floorY: 0, enemyIndexes: [3], waypoints: [[-12,-22],[-8,-21],[-4,-24],[4,-22],[12,-18],[16,-16]] },
        { id: 'warehouse-west', label: '西仓库环路', floorY: 0, enemyIndexes: [4], waypoints: [[-28,-14],[-24,-16],[-22,-16],[-16,-10],[-20,-6],[-24,-6]] },
        { id: 'crane-yard', label: '起重机货场', floorY: 0, enemyIndexes: [5], waypoints: [[24,-12],[26,-14],[24,-24],[22,-24],[18,-16]] },
        { id: 'platform-east', label: '装卸平台（东）', floorY: 1.8, enemyIndexes: [6], waypoints: [[-25,5],[-22,6],[-20,6.5],[-18.5,7],[-22,4]] },
        { id: 'south-west-crates', label: '西南货堆', floorY: 0, enemyIndexes: [7], waypoints: [[-18,23],[-14,25],[-8,26],[2,24],[6,23],[12,19],[4,13]] },
        { id: 'mid-west', label: '中西部', floorY: 0, enemyIndexes: [8], waypoints: [[-15,11],[-11,10],[-8,8],[-4,10],[-2,12],[-8,16]] },
        { id: 'roamer', label: '游走巡逻', floorY: 0, enemyIndexes: [9], waypoints: [[10,-10],[7,-7],[4,-4],[8,0],[13,2],[18,-8]] }
      ],
      cover: [
        /* 西侧仓库外壳（东侧开口） */
        B(0.6, 4.4, 13, -29.7, 0, -4.5, 'wall', { uvScale: [4.2, 1.6], minimap: { color: '#23303a' } }),
        B(18.0, 4.4, 0.6, -20.7, 0, -11, 'wall', { uvScale: [5.0, 1.6], minimap: { color: '#23303a' } }),
        B(7, 4.4, 0.6, -16.5, 0, 2, 'wall', { uvScale: [2.2, 1.6], minimap: { color: '#23303a' } }),
        B(0.7, 3.8, 0.7, -13.2, 0, -5, 'concrete', { minimap: { color: '#23303a' } }),
        B(0.7, 3.8, 0.7, -13.2, 0, 0, 'concrete', { minimap: { color: '#23303a' } }),
        /* 装卸平台（1.8m 高低差） */
        B(9, 0.4, 9, -22.5, 1.8, 3.5, 'concrete', { collide: false, ground: true, ceiling: false, minimap: { color: '#2a3a46' } }),
        B(0.2, 1.0, 9, -18.1, 1.8, 3.5, 'darkMetal', { minimap: { color: '#2a3a46' } }),
        B(9, 1.0, 0.2, -22.5, 1.8, 7.05, 'darkMetal', { minimap: { color: '#2a3a46' } }),
        CT(-24, 1.8, 5, 0, '#4f6f69'),
        CT(-20.5, 1.8, 6.5, 0, '#53718c'),
        CT(-24, 4.65, 5, 0, '#a85748'),
        CT(-20.5, 4.65, 6.5, 0, '#707f56'),
        B(2.6, 0.9, 0.5, -19.8, 1.8, 1.2, 'rust', { minimap: { color: '#2a3a46' } }),
        B(0.5, 0.9, 2.4, -26.2, 1.8, 6.8, 'rust', { minimap: { color: '#2a3a46' } }),
        /* 中央双排集装箱走廊 */
        CT(3.5, 0, -20, 0, '#a85748'),
        CT(3.5, 0, -8, 0, '#53718c'),
        CT(3.5, 0, 4, 0, '#707f56'),
        CT(3.5, 0, 16, 0, '#ab8a3f'),
        CT(10.5, 0, -16, 0, '#7e5243'),
        CT(10.5, 0, -4, 0, '#4f6f69'),
        CT(10.5, 0, 8, 0, '#a85748'),
        CT(10.5, 0, 20, 0, '#53718c'),
        CT(10.5, 2.85, -4, 0, '#8b9096'),
        CT(3.5, 2.85, 4, 0, '#707f56'),
        CT(3.5, 2.85, -20, 0, '#8b9096'),
        CT(10.5, 2.85, 8, 0, '#4f6f69'),
        CT(10.5, 2.85, 20, 0, '#a85748'),
        CT(16, 0, 14, PI_2, '#4f6f69'),
        CT(-2, 0, -14, 0, '#53718c'),
        /* 东侧岸桥起重机 */
        B(0.9, 6.5, 0.9, 20.5, 0, -8, 'rust', { minimap: { color: '#38464f' } }),
        B(0.9, 6.5, 0.9, 27.5, 0, -8, 'rust', { minimap: { color: '#38464f' } }),
        B(8.2, 1.0, 1.0, 24, 6.4, -8, 'darkMetal', { ground: true, minimap: { color: '#38464f' } }),
        B(2.4, 2.4, 2.4, 27.8, 4.2, -8, 'container', { minimap: { color: '#38464f' } }),
        /* 东侧货棚（屋顶 3.0m，可站立） */
        B(0.6, 3.2, 10, 21, 0, -20, 'wall', { minimap: { color: '#23303a' } }),
        B(0.6, 3.2, 10, 27, 0, -20, 'wall', { minimap: { color: '#23303a' } }),
        B(6, 3.2, 0.6, 24, 0, -25, 'wall', { minimap: { color: '#23303a' } }),
        B(3, 3.2, 0.6, 22.5, 0, -15, 'wall', { minimap: { color: '#23303a' } }),
        B(6, 0.3, 10, 24, 3.0, -20, 'concrete', { collide: false, ground: true, ceiling: true, minimap: { color: '#2a3a46' } }),
        /* 南部入口隔离墩 */
        JB(-8, 21, 0), JB(-4, 23, 0), JB(4, 23, 0), JB(8, 21, 0), JB(0, 18.5, 0),
        JB(-22, 16, 0), JB(-19, 16, 0),
        /* 北岸防波堤 + 前置隔离墩 */
        B(10, 1.2, 0.6, -24, 0, -26, 'concrete', { minimap: { color: '#23303a' } }),
        B(10, 1.2, 0.6, -12, 0, -26, 'concrete', { minimap: { color: '#23303a' } }),
        B(10, 1.2, 0.6, 0, 0, -26, 'concrete', { minimap: { color: '#23303a' } }),
        B(10, 1.2, 0.6, 12, 0, -26, 'concrete', { minimap: { color: '#23303a' } }),
        B(10, 1.2, 0.6, 24, 0, -26, 'concrete', { minimap: { color: '#23303a' } }),
        JB(-20, -22, 0), JB(-16, -22, 0), JB(16, -22, 0), JB(20, -22, 0),
        /* 中央岗亭 */
        B(0.25, 2.6, 3.2, -3.4, 0, -2, 'wall', { minimap: { color: '#2c3942' } }),
        B(0.25, 2.6, 3.2, -0.6, 0, -2, 'wall', { minimap: { color: '#2c3942' } }),
        B(3.2, 2.6, 0.25, -2, 0, -3.4, 'wall', { minimap: { color: '#2c3942' } }),
        B(2.0, 2.6, 0.25, -1.6, 0, -0.6, 'wall', { minimap: { color: '#2c3942' } }),
        B(3.2, 0.3, 3.2, -2, 2.6, -2, 'darkMetal', { collide: false, ground: true, ceiling: true, minimap: { color: '#2c3942' } }),
        /* 木箱堆 */
        CR(-13.8, 0, 12.4, 0.5), CR(-13.0, 0, 13.1, 1.1), CR(-12.2, 0, 12.3, 0.8),
        CR(14.8, 0, 11.0, 0.3), CR(15.6, 0, 11.8, 0.9),
        CR(22.4, 0, 19.2, 0.4), CR(23.2, 0, 18.5, 1.2),
        CR(-11.2, 0, -14.6, 0.7), CR(-10.4, 0, -15.3, 0.2),
        CR(4.4, 0, -24.6, 0.5), CR(5.2, 0, -23.9, 1.0),
        CR(1.6, 0, 12.2, 0.6), CR(2.4, 0, 13.0, 0.3),
        CR(-23.6, 0, -22.4, 0.8), CR(-22.8, 0, -21.7, 0.4),
        CR(-16.4, 0, 16.8, 0.5), CR(-15.6, 0, 17.5, 1.0),
        CR(-13.4, 1.25, 12.8, 0.6), CR(22.8, 1.25, 18.9, 0.5),
        CR(-26.4, 0, -6.4, 0.4), CR(-25.6, 0, -7.2, 0.9),
        CR(18.8, 0, 2.4, 0.6), CR(19.6, 0, 3.2, 0.3),
        CR(-20.4, 0, 20.4, 0.5), CR(-19.6, 0, 21.2, 0.9),
        CR(13.2, 0, -19.2, 0.4), CR(14.0, 0, -18.4, 0.8),
        CR(-4.8, 0, -19.2, 0.6), CR(-4.0, 0, -18.4, 0.3),
        /* 油桶堆 */
        BR(-20.5, 0, -17.5), BR(-20.1, 0, -17.2), BR(-20.9, 0, -17.1),
        BR(16.2, 0, -13.8), BR(16.6, 0, -13.5), BR(15.8, 0, -13.4),
        BR(-0.5, 0, 16.5), BR(-0.1, 0, 16.8), BR(-0.9, 0, 16.9),
        BR(24.5, 0, 14.5), BR(24.9, 0, 14.8), BR(24.1, 0, 14.9), BR(24.5, 0.95, 14.6),
        BR(-24.5, 0, 16.5), BR(-24.1, 0, 16.8), BR(-24.9, 0, 16.9),
        BR(12.5, 0, -24.5), BR(12.9, 0, -24.2), BR(12.1, 0, -24.1), BR(12.5, 0.95, -24.4),
        BR(18.5, 0, 0.5), BR(18.9, 0, 0.8), BR(18.1, 0, 0.9),
        BR(6.5, 0, -4.5), BR(6.9, 0, -4.2), BR(6.1, 0, -4.1), BR(6.5, 0.95, -4.4),
        BR(-24, 0, -24), BR(-8, 0, -24), BR(8, 0, -24), BR(24, 0, -24),
        BR(-9.5, 0, 6.5), BR(-9.1, 0, 6.8), BR(-9.9, 0, 6.9),
        BR(0.8, 0, -20.5), BR(1.2, 0, -20.2), BR(0.4, 0, -20.1),
        BR(-18.2, 0, -3.8), BR(-17.8, 0, -3.5), BR(-18.6, 0, -3.4),
        BR(-15.2, 0, -19.2), BR(-14.8, 0, -18.9), BR(-15.6, 0, -18.8),
        BR(26.8, 0, 20.4), BR(27.2, 0, 20.7), BR(26.4, 0, 20.8)
      ],
      ramps: [
        {
          id: 'loading-platform-ramp',
          label: '装卸平台坡道',
          x: -24, z: 11, width: 4, length: 6, baseY: 0, topY: 1.8,
          direction: '-Z',
          minimap: { w: 4, d: 6, color: '#3a4854' },
          sideWalls: [
            B(0.26, 2.1, 6, -26.0, 0, 11, 'concrete'),
            B(0.26, 2.1, 6, -22.0, 0, 11, 'concrete')
          ]
        },
        {
          id: 'shed-roof-ramp',
          label: '东货棚屋顶坡道',
          x: 24, z: -16.5, width: 4, length: 5, baseY: 0, topY: 3.0,
          direction: '-Z',
          minimap: { w: 4, d: 5, color: '#3a4854' },
          sideWalls: [
            B(0.26, 3.3, 5, 22.0, 0, -16.5, 'concrete'),
            B(0.26, 3.3, 5, 26.0, 0, -16.5, 'concrete')
          ]
        }
      ]
    },

    /* =====================================================================
     * 雪地基地（新图）
     * =================================================================== */
    {
      id: 'snow-base',
      name: '雪地基地',
      codename: 'SNOW BASE',
      subtitle: 'ARCTIC OUTPOST',
      half: 30,
      theme: {
        sky: 'arctic-day',
        fogColor: '#c8d4da',
        fogDensity: 0.008,
        sunColor: '#fff4d6',
        sunDirection: [0.4, 0.62, 0.5],
        ambient: '#dfe8ec',
        minimapBg: 'rgba(15,25,30,.82)',
        gridColor: 'rgba(180,210,220,.10)'
      },
      perimeter: { wallHeight: 12, thickness: 1.2, fenceHeight: 3.3 },
      playerSpawns: [
        { id: 'south-gate', label: '南侧入口', x: 0, z: 26, yaw: 0, floorY: 0 },
        { id: 'west-gate', label: '西侧入口', x: -27, z: 16, yaw: PI_2, floorY: 0 }
      ],
      defaultSpawn: 0,
      enemies: {
        count: 10,
        names: DEFAULT_ENEMY_NAMES.slice(),
        grace: 3.0,
        spawns: [
          { routeIndex: 0, x: 8, z: -16, floorY: 0, label: '中央走廊北端' },
          { routeIndex: 1, x: -7, z: -6, floorY: 3.2, label: '地堡二层西北' },
          { routeIndex: 2, x: 20, z: 6, floorY: 0, label: '东侧集装箱区' },
          { routeIndex: 3, x: -24, z: -18, floorY: 0, label: '西侧外围' },
          { routeIndex: 4, x: -12, z: -24, floorY: 0, label: '北侧外围' },
          { routeIndex: 5, x: 24, z: 6, floorY: 0, label: '瞭望塔东侧' },
          { routeIndex: 6, x: -2, z: -6, floorY: 3.2, label: '地堡二层东' },
          { routeIndex: 7, x: -22, z: 23, floorY: 0, label: '西南货堆' },
          { routeIndex: 8, x: -16, z: 10, floorY: 0, label: '中西部' },
          { routeIndex: 9, x: 12, z: -12, floorY: 0, label: '北区游走' }
        ]
      },
      routes: [
        { id: 'central-lane', label: '中央走廊', floorY: 0, enemyIndexes: [0], waypoints: [[8,-16],[8,-10],[8,-4],[8,2],[8,8],[8,13],[8,18]] },
        { id: 'bunker-deck-1', label: '地堡二层（西）', floorY: 3.2, enemyIndexes: [1], waypoints: [[-7,-6],[-5,-4],[-2,-3],[-3,0],[-6,1],[-8,-2]] },
        { id: 'east-containers', label: '东侧集装箱区', floorY: 0, enemyIndexes: [2], waypoints: [[12,16],[20,20],[22,12],[19,8],[18,6]] },
        { id: 'west-perimeter', label: '西侧外围', floorY: 0, enemyIndexes: [3], waypoints: [[-24,-18],[-21,-20],[-18,-22],[-14,-21],[-10,-20],[-16,-12]] },
        { id: 'north-perimeter', label: '北侧外围', floorY: 0, enemyIndexes: [4], waypoints: [[-12,-24],[-8,-25],[-4,-26],[2,-25],[4,-24],[0,-18]] },
        { id: 'watchtower-yard', label: '瞭望塔货场', floorY: 0, enemyIndexes: [5], waypoints: [[14,8],[20,6],[22,12],[18,16],[15,12]] },
        { id: 'bunker-deck-2', label: '地堡二层（东）', floorY: 3.2, enemyIndexes: [6], waypoints: [[-2,-6],[-0.5,-2],[-1,2],[-3,1],[-4,-3]] },
        { id: 'south-west-crates', label: '西南货堆', floorY: 0, enemyIndexes: [7], waypoints: [[-22,23],[-15,25],[-8,26],[2,24],[6,23],[12,20],[2,14]] },
        { id: 'mid-west', label: '中西部', floorY: 0, enemyIndexes: [8], waypoints: [[-16,10],[-12,9],[-10,8],[-4,12],[-10,16]] },
        { id: 'roamer', label: '游走巡逻', floorY: 0, enemyIndexes: [9], waypoints: [[12,-12],[9,-9],[6,-6],[7,0],[14,-2],[20,-8]] }
      ],
      cover: [
        /* 中央地堡（二层 3.2m） */
        B(0.6, 3.4, 16.5, -8.7, 0, -1, 'concrete', { minimap: { color: '#8b989c' } }),
        B(0.6, 3.4, 16.5, 0.7, 0, -1, 'concrete', { minimap: { color: '#8b989c' } }),
        B(9.4, 3.4, 0.6, -4, 0, -9.25, 'concrete', { minimap: { color: '#8b989c' } }),
        B(6, 3.4, 0.6, -5.5, 0, 7.25, 'concrete', { minimap: { color: '#8b989c' } }),
        B(9.4, 0.4, 16.5, -4, 3.0, -1, 'concrete', { collide: false, ground: true, ceiling: true, minimap: { color: '#aab6ba' } }),
        B(9.4, 1.0, 0.22, -4, 3.2, -9.25, 'darkMetal'),
        B(0.22, 1.0, 16.5, -8.7, 3.2, -1, 'darkMetal'),
        B(0.22, 1.0, 16.5, 0.7, 3.2, -1, 'darkMetal'),
        B(3.4, 1.0, 0.22, -6.4, 3.2, 7.25, 'darkMetal'),
        B(1.4, 1.0, 0.22, -0.35, 3.2, 7.25, 'darkMetal'),
        B(2.6, 0.9, 0.5, -6.8, 3.2, -7.8, 'rust', { minimap: { color: '#a39a8c' } }),
        B(0.5, 0.9, 2.6, -1.5, 3.2, -3.2, 'rust', { minimap: { color: '#a39a8c' } }),
        CT(-5.5, 3.2, 0.5, 0, '#d8dde0'),
        /* 东北瞭望塔（1.8m） */
        B(0.35, 2.3, 0.35, 16.7, 0, 8.8, 'darkMetal', { minimap: { color: '#6f7b80' } }),
        B(0.35, 2.3, 0.35, 19.3, 0, 8.8, 'darkMetal', { minimap: { color: '#6f7b80' } }),
        B(0.35, 2.3, 0.35, 16.7, 0, 11.2, 'darkMetal', { minimap: { color: '#6f7b80' } }),
        B(0.35, 2.3, 0.35, 19.3, 0, 11.2, 'darkMetal', { minimap: { color: '#6f7b80' } }),
        B(3.2, 0.3, 3.2, 18, 1.8, 10, 'darkMetal', { collide: false, ground: true, minimap: { color: '#aab6ba' } }),
        B(3.2, 1.0, 0.16, 18, 1.8, 8.42, 'darkMetal'),
        B(0.16, 1.0, 3.2, 16.42, 1.8, 10, 'darkMetal'),
        B(0.16, 1.0, 3.2, 19.58, 1.8, 10, 'darkMetal'),
        /* 雪地涂装集装箱 */
        CT(10, 0, -16, 0, '#a9b6ba'),
        CT(10, 0, -6, 0, '#c6cdd1'),
        CT(10, 0, 4, 0, '#8f9ba0'),
        CT(10, 0, 14, 0, '#d8dde0'),
        CT(17, 0, -12, 0, '#8f9ba0'),
        CT(17, 0, -2, 0, '#a9b6ba'),
        CT(17, 0, 8, 0, '#c6cdd1'),
        CT(17, 0, 18, 0, '#d8dde0'),
        CT(17, 2.85, -2, 0, '#a9b6ba'),
        CT(10, 2.85, 4, 0, '#c6cdd1'),
        /* 冰面隔离墙（沿用隔离墩碰撞体） */
        JB(-12, 16, 0), JB(-9, 18, 0), JB(-6, 16, 0),
        JB(14, 18, PI_2), JB(17, 18, PI_2),
        JB(-18, -10, 0), JB(-15, -10, 0),
        JB(6, 12, PI_2),
        JB(9, -20, 0), JB(12, -20, 0),
        JB(22, -2, 0), JB(22, 1, 0),
        JB(-24, -16, PI_2), JB(-21, -16, PI_2),
        /* 出生区沙袋 */
        B(3, 1.0, 0.6, -9, 0, 20, 'rust', { minimap: { color: '#a39a8c' } }),
        B(3, 1.0, 0.6, 9, 0, 20, 'rust', { minimap: { color: '#a39a8c' } }),
        /* 木箱堆 */
        CR(-13.8, 0, 10.4, 0.4), CR(-13.0, 0, 11.2, 0.9), CR(-12.2, 0, 10.4, 0.6),
        CR(14.6, 0, 16.2, 0.5), CR(15.4, 0, 17.0, 1.0), CR(14.2, 1.25, 16.6, 0.7),
        CR(21.6, 0, 18.6, 0.3), CR(22.4, 0, 17.8, 0.8),
        CR(-21.6, 0, -20.6, 0.6), CR(-20.8, 0, -19.8, 0.2),
        CR(8.2, 0, -22.6, 0.5), CR(9.0, 0, -21.8, 1.0),
        CR(-1.6, 0, 12.4, 0.7), CR(-0.8, 0, 13.2, 0.3),
        CR(-19.6, 0, 23.8, 0.5), CR(-18.8, 0, 24.6, 0.9),
        CR(18.2, 0, -23.8, 0.4), CR(19.0, 0, -23.0, 0.8),
        CR(12.2, 0, 3.8, 0.6), CR(13.0, 0, 4.6, 0.3),
        CR(-11.6, 0, -4.4, 0.8), CR(-10.8, 0, -3.6, 0.5),
        /* 油桶堆 */
        BR(-8.2, 0, -14.2), BR(-7.8, 0, -13.9), BR(-8.6, 0, -13.8),
        BR(14.2, 0, 14.2), BR(14.6, 0, 14.5), BR(13.8, 0, 14.6),
        BR(-23.8, 0, -4.2), BR(-23.4, 0, -3.9), BR(-24.2, 0, -3.8),
        BR(23.8, 0, -16.2), BR(24.2, 0, -15.9), BR(23.4, 0, -15.8),
        BR(8.2, 0, 16.2), BR(8.6, 0, 16.5), BR(7.8, 0, 16.6), BR(8.2, 0.95, 16.3),
        BR(-7.8, 0, 22.2), BR(-7.4, 0, 22.5), BR(-8.2, 0, 22.6)
      ],
      ramps: [
        {
          id: 'bunker-ramp',
          label: '地堡二层坡道',
          x: -4, z: 9.75, width: 4, length: 5, baseY: 0, topY: 3.2,
          direction: '-Z',
          minimap: { w: 4, d: 5, color: '#9aa6aa' },
          sideWalls: [
            B(0.26, 3.5, 5, -6.0, 0, 9.75, 'concrete'),
            B(0.26, 3.5, 5, -2.0, 0, 9.75, 'concrete')
          ]
        },
        {
          id: 'watchtower-ramp',
          label: '瞭望塔坡道',
          x: 18, z: 13.5, width: 3, length: 4, baseY: 0, topY: 1.8,
          direction: '-Z',
          minimap: { w: 3, d: 4, color: '#9aa6aa' },
          sideWalls: [
            B(0.26, 2.1, 4, 16.5, 0, 13.5, 'darkMetal'),
            B(0.26, 2.1, 4, 19.5, 0, 13.5, 'darkMetal')
          ]
        }
      ]
    }
  ];

  /* =====================================================================
   * 公开接口
   * =================================================================== */

  function list() {
    return maps.map(function (m) {
      return { id: m.id, name: m.name, codename: m.codename, subtitle: m.subtitle, half: m.half };
    });
  }

  function get(id) {
    for (var i = 0; i < maps.length; i++) if (maps[i].id === id) return maps[i];
    return null;
  }

  function defaultId() {
    return maps.length ? maps[0].id : null;
  }

  function getDefault() {
    return get(defaultId());
  }

  function enemyNames(map) {
    var list2 = map && map.enemies && map.enemies.names;
    return list2 && list2.length ? list2.slice() : DEFAULT_ENEMY_NAMES.slice();
  }

  /* 每个敌人一个刷新点；未显式给出时回退到其路线的最后一个航点。 */
  function enemySpawns(map) {
    var out = [];
    var count = map && map.enemies ? (map.enemies.count || 0) : 0;
    for (var i = 0; i < count; i++) {
      var s = map.enemies.spawns && map.enemies.spawns[i];
      var route = map.routes && map.routes[i];
      var last = route && route.waypoints && route.waypoints.length
        ? route.waypoints[route.waypoints.length - 1] : [0, 0];
      out.push({
        x: s ? s.x : last[0],
        z: s ? s.z : last[1],
        floorY: s ? (s.floorY || 0) : (route ? (route.floorY || 0) : 0),
        routeIndex: s && s.routeIndex != null ? s.routeIndex : i,
        label: s && s.label ? s.label : ''
      });
    }
    return out;
  }

  /* 把单个 cover 条目展开成轴对齐碰撞盒（与原 addCollider 语义一致）。 */
  function coverCollider(c) {
    if (!c) return null;
    var p = PRIMITIVES[c.shape];
    var w, h, d;
    if (c.shape === 'box' || !p) {
      w = c.w; h = c.h; d = c.d;
    } else {
      w = c.w || p.w; h = c.h || p.h; d = c.d || p.d;
    }
    if (!(w > 0 && h > 0 && d > 0)) return null;
    var x = c.x, y = c.y || 0, z = c.z;
    var rotY = c.rotY || 0;
    var quarter = Math.abs((rotY % Math.PI) - PI_2) < 0.001 || Math.abs((rotY % Math.PI) + PI_2) < 0.001;
    var sx = quarter ? d : w;
    var sz = quarter ? w : d;
    var collide = c.collide !== false;
    var walkable = c.ground !== undefined ? !!c.ground : collide;
    var minimap = c.minimap || (p ? { color: p.minimap, w: sx, d: sz } : null);
    return {
      minX: x - sx / 2, maxX: x + sx / 2,
      minY: y, maxY: y + h,
      minZ: z - sz / 2, maxZ: z + sz / 2,
      collide: collide,
      walkable: walkable,
      minimap: minimap
    };
  }

  /* 展开整张地图的碰撞盒：cover + 坡道（坡道以 ramp 标记，交给集成方建斜面）。 */
  function toColliders(map) {
    var out = [];
    if (!map) return out;
    for (var i = 0; i < map.cover.length; i++) {
      var c = coverCollider(map.cover[i]);
      if (c) out.push(c);
    }
    for (var j = 0; j < (map.ramps || []).length; j++) {
      var r = map.ramps[j];
      var z0 = r.direction === '+Z' ? r.z + r.length / 2 : r.z - r.length / 2;
      var z1 = r.direction === '+Z' ? r.z - r.length / 2 : r.z + r.length / 2;
      out.push({
        ramp: true,
        id: r.id,
        x: r.x, z: r.z, width: r.width, length: r.length,
        baseY: r.baseY, topY: r.topY, direction: r.direction,
        minX: r.x - r.width / 2, maxX: r.x + r.width / 2,
        minY: Math.min(r.baseY, r.topY), maxY: Math.max(r.baseY, r.topY),
        minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1),
        walkable: true,
        minimap: r.minimap || null
      });
      for (var k = 0; k < (r.sideWalls || []).length; k++) {
        var s = coverCollider(r.sideWalls[k]);
        if (s) out.push(s);
      }
    }
    return out;
  }

  /* 开发期自检：边界、出生点、路线与掩体的一致性。 */
  function validate(map) {
    var errors = [], warnings = [];
    if (!map) return { ok: false, errors: ['map 不能为空'], warnings: [] };
    var H = map.half;
    if (!(H > 0)) {
      errors.push('half 必须为正数');
      H = 30;
    }
    var hard = H + 1.3;
    var colliders = toColliders(map);

    function inBounds(x, z, limit) {
      return Math.abs(x) <= limit && Math.abs(z) <= limit;
    }
    function bodyHit(x, z, floorY, cols) {
      var y0 = floorY + 0.30, y1 = floorY + 1.70;
      for (var i = 0; i < cols.length; i++) {
        var c = cols[i];
        if (!c || c.ramp || c.collide === false) continue;
        if (y1 <= c.minY + 0.02 || y0 >= c.maxY - 0.02) continue;
        var cx = Math.max(c.minX, Math.min(x, c.maxX));
        var cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        var dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz < 0.45 * 0.45) return true;
      }
      return false;
    }

    if (!map.playerSpawns || !map.playerSpawns.length) {
      errors.push('缺少 playerSpawns');
    } else {
      map.playerSpawns.forEach(function (p, i) {
        if (!inBounds(p.x, p.z, H - 0.8)) errors.push('玩家出生点越界: ' + p.id);
        if (bodyHit(p.x, p.z, p.floorY || 0, colliders)) errors.push('玩家出生点与掩体重叠: ' + p.id);
      });
    }

    var count = map.enemies ? (map.enemies.count || 0) : 0;
    var spawns = enemySpawns(map);
    if (count !== 10) warnings.push('敌人数量不是 10: ' + count);
    if (spawns.length !== count) errors.push('敌人刷新点数量与 count 不一致');
    if (map.routes.length !== count) errors.push('路线数量与敌人数量不一致');
    spawns.forEach(function (s, i) {
      if (!inBounds(s.x, s.z, H - 0.8)) errors.push('敌人刷新点越界: #' + i);
      if (bodyHit(s.x, s.z, s.floorY, colliders)) errors.push('敌人刷新点与掩体重叠: #' + i);
    });

    var names = enemyNames(map);
    if (names.length !== count) warnings.push('敌人名字数量与 count 不一致');

    map.routes.forEach(function (r, i) {
      r.waypoints.forEach(function (p, k) {
        if (!inBounds(p[0], p[1], H - 0.8)) errors.push('路线航点越界: ' + r.id + ' #' + k);
      });
      (r.enemyIndexes || []).forEach(function (ei) {
        if (ei < 0 || ei >= count) errors.push('enemyIndexes 越界: ' + r.id);
      });
    });

    map.cover.forEach(function (c, i) {
      var a = coverCollider(c);
      if (!a) {
        errors.push('cover 无法解析为 AABB: #' + i);
        return;
      }
      if (a.minX < -hard || a.maxX > hard || a.minZ < -hard || a.maxZ > hard) {
        errors.push('掩体超出地图硬边界: #' + i);
      } else if (a.minX < -H || a.maxX > H || a.minZ < -H || a.maxZ > H) {
        warnings.push('掩体超出 60x60 游戏区（进入围墙区）: #' + i);
      }
    });

    (map.ramps || []).forEach(function (r, i) {
      if (!inBounds(r.x, r.z, H - 0.5)) errors.push('坡道超出地图范围: ' + r.id);
      if (!(r.topY > r.baseY)) errors.push('坡道高度无效: ' + r.id);
    });

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  function validateAll() {
    var allOk = true;
    var out = [];
    for (var i = 0; i < maps.length; i++) {
      var m = maps[i];
      var r = validate(m);
      out.push({ id: m.id, name: m.name, ok: r.ok, errors: r.errors, warnings: r.warnings });
      if (!r.ok) allOk = false;
    }
    return { ok: allOk, maps: out };
  }

  var CSMaps = {
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    list: list,
    get: get,
    defaultId: defaultId,
    getDefault: getDefault,
    enemyNames: enemyNames,
    enemySpawns: enemySpawns,
    coverCollider: coverCollider,
    toColliders: toColliders,
    validate: validate,
    validateAll: validateAll
  };

  global.CSMaps = CSMaps;
  if (typeof module !== 'undefined' && module.exports) module.exports = CSMaps;
})(typeof window !== 'undefined' ? window : globalThis);
