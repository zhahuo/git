/* 小小CSGO V3 默认中文语言包
 * 运行时加载后自动注册为 zh；键名结构见 docs/模块笔记/V3-汉化.md。
 */
(function (global) {
  'use strict';

  const zh = {
    meta: {
      title: '小小CSGO — 仓库区',
      description: '十名敌兵占据一座集装箱场，你只有三分钟。整个游戏——世界、武器、AI 与音频——是一个约 290 KB 的 HTML 文件，无需构建，也没有外部素材。'
    },
    hud: {
      map: {
        tactical: '战术地图',
        sector: '第 7 区'
      },
      breath: '屏住呼吸',
      objective: '已消灭 {kills} / 10',
      vitals: '生命',
      armor: '护甲',
      ammoReserve: '/ {count}',
      mode: {
        fullAuto: '全自动',
        semiAuto: '半自动',
        pump: '泵动式',
        bolt: '栓动式'
      },
      reload: {
        noAmmo: '无弹药',
        pressR: '按 R 换弹'
      },
      feed: {
        you: '你'
      }
    },
    comms: {
      command: '指挥部',
      bearings: ['北', '东北', '东', '东南', '南', '西南', '西', '西北'],
      gunfire: {
        shots: '枪声 —— {bearing}',
        contact: '发现枪声，前往支援',
        sweeping: '枪声，正在搜索 {bearing}'
      },
      contact: '发现接触，{bearing}',
      spotted: '发现目标 —— {bearing}',
      eyesOn: '已锁定，{bearing}',
      hostile: '敌情，{bearing}',
      down: '{name} 已倒下 —— {bearing}',
      manDown: '有人倒下，集合',
      lost: '我们失去了 {name}，压上去',
      flankingRight: '向右侧翼包抄',
      flankingLeft: '向左侧翼包抄',
      movingWide: '拉开侧翼',
      goingAround: '绕后，压制他',
      pushingUp: '向前推进',
      closingIn: '正在接近',
      onHim: '盯住他',
      reloading: '换弹中 —— 掩护我',
      magOut: '弹匣空了',
      changingMags: '正在更换弹匣',
      lostVisual: '失去视野',
      whereIsHe: '他在哪',
      brokeContact: '他脱离了接触'
    },
    menu: {
      slugTop: '小小CSGO // 第 7 区',
      slugRight: '集装箱场 04<br>网格 118-042',
      slugBottom: '10 名敌兵 · 倒计时 03:00',
      eyebrow: '机密 // 特遣队 小小CSGO',
      title: '仓库<br>区',
      titleSmall: '第 7 区 —— 敌占区',
      cta: '点击开始',
      hint: '在倒计时结束前消灭全部 10 名敌兵'
    },
    keys: {
      move: '移动',
      look: '视角',
      fire: '射击',
      ads: '瞄准',
      sprint: '疾跑 · 屏息',
      jump: '跳跃 · 二段跳 · 攀爬',
      crouch: '下蹲',
      reload: '换弹',
      weapons: '切换武器',
      fireMode: '射击模式',
      pause: '暂停'
    },
    pause: {
      title: '已暂停',
      sub: '点击继续'
    },
    end: {
      winTitle: '区域已清空',
      deadTitle: '阵亡',
      timeTitle: '时间耗尽',
      winTag: '任务报告 // 成功',
      loseTag: '任务报告 // 失败',
      sub: '第 7 区 —— 仓库区',
      stats: {
        kills: '消灭数',
        killsSuffix: '/10',
        headshots: '爆头数',
        accuracy: '命中率',
        accuracySuffix: '%',
        time: '存活时间'
      },
      restart: '重新部署'
    },
    boot: {
      loading: '正在装载弹药…',
      failed: 'three.js 加载失败 —— 请检查网络连接'
    },
    weapons: {
      rifle: { name: 'M4 卡宾枪' },
      shotgun: { name: 'KS-12 泵动霰弹枪' },
      pistol: { name: 'P-9 手枪' },
      sniper: { name: 'SR-7 长弓狙击枪' }
    },
    enemies: {
      names: ['毒蛇', '幽灵', '收割者', '浩劫', '突击者', '眼镜蛇', '利爪', '恶狼', '柴油', '暗影']
    },
    world: {
      bay: 'B{n}',
      stencil: {
        noParking: '禁止停车',
        keepClear: '保持畅通',
        sector: '第 7 区',
        danger: '危险 —— 机械移动'
      },
      sign: {
        sub: '物流 · 7 号港'
      },
      crate: {
        fragile: '易碎品',
        lot: '批次 44-{n}'
      },
      container: {
        maxGross: '最大毛重  {n},480 KG',
        tare: '皮重  {n} KG',
        cuCap: '容积  {n} CU M',
        cscSafety: 'CSC 安全',
        approval: '核准',
        gb: 'GB/{n}'
      }
    }
  };

  if (global.I18N) global.I18N.register('zh', zh);
  else global.I18N_ZH = zh;
})(typeof window !== 'undefined' ? window : globalThis);
