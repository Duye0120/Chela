# Chela Theme System

> **Chela** (/ˈkiːlə/) — 蟹钳，蟹蟹干活的小爪子
> Theme 设计原则：温暖但不甜腻，有极客感但不冷冰冰
> 灵感来源：蟹壳橙红 + 深海蓝灰 + 贝壳珍珠白

## Color Palette

### Primary — 蟹壳橙（Chela Orange）
主色调，温暖、有活力，代表"蟹蟹"的生命力。

```css
/* 蟹壳橙 — 从浅到深 */
--chela-50:  #fff7ed;   /* 极浅蟹壳，用于背景 */
--chela-100: #ffedd5;   /* 浅蟹壳，用于 hover */
--chela-200: #fed7aa;   /* 蟹壳浅色 */
--chela-300: #fdba74;   /* 蟹壳中浅 */
--chela-400: #fb923c;   /* 蟹壳中色 */
--chela-500: #f97316;   /* 标准蟹壳橙 — 主色 */
--chela-600: #ea580c;   /* 深蟹壳，用于 active */
--chela-700: #c2410c;   /* 蟹壳深色 */
--chela-800: #9a3412;   /* 深蟹壳暗 */
--chela-900: #7c2d12;   /* 蟹壳暗色 */
--chela-950: #431407;   /* 极暗蟹壳 */
```

### Secondary — 深海蓝灰（Abyss Slate）
冷色调，与橙色形成对比，代表"极客/技术"的一面。

```css
/* 深海蓝灰 — 从浅到深 */
--chela-slate-50:  #f8fafc;
--chela-slate-100: #f1f5f9;
--chela-slate-200: #e2e8f0;
--chela-slate-300: #cbd5e1;
--chela-slate-400: #94a3b8;
--chela-slate-500: #64748b;   /* 标准深海灰 */
--chela-slate-600: #475569;
--chela-slate-700: #334155;
--chela-slate-800: #1e293b;   /* 深海暗色，用于深色背景 */
--chela-slate-900: #0f172a;   /* 极暗深海 */
--chela-slate-950: #020617;   /* 深渊 */
```

### Accent — 贝壳珍珠（Pearl）
点缀色，柔和但有存在感，用于高亮和特殊状态。

```css
/* 贝壳珍珠 */
--chela-pearl:  #f8f9fa;      /* 珍珠白 */
--chela-shell:  #e8edf3;      /* 贝壳灰 */
--chela-coral:  #ff8a65;      /* 珊瑚粉橙，用于强调 */
--chela-reef:   #4dd0e1;      /* 珊瑚礁蓝，用于信息/链接 */
```

### Semantic Colors

```css
/* 状态色 */
--chela-success: #22c55e;     /* 绿 — 成功/健康 */
--chela-warning: #eab308;     /* 黄 — 警告 */
--chela-error:   #ef4444;     /* 红 — 错误 */
--chela-info:    #3b82f6;     /* 蓝 — 信息 */

/* 思考色 — 蟹蟹思考时的颜色 */
--chela-thinking: #a78bfa;    /* 紫 — 思考/推理 */
```

## Theme Tokens

### Light Mode (浅色模式)

```css
:root {
  /* === 背景 === */
  --chela-bg-primary:   var(--chela-pearl);    /* 主背景 */
  --chela-bg-secondary: var(--chela-shell);    /* 次背景（面板） */
  --chela-bg-tertiary:  var(--chela-slate-100); /* 第三层背景 */
  --chela-bg-surface:   #ffffff;               /* 卡片/表面 */
  --chela-bg-muted:     var(--chela-slate-50);  /* 静默背景 */

  /* === 边框 === */
  --chela-border:       var(--chela-slate-200);
  --chela-border-muted: var(--chela-slate-100);
  --chela-border-focus: var(--chela-500);

  /* === 文字 === */
  --chela-text-primary:   var(--chela-slate-900);
  --chela-text-secondary: var(--chela-slate-600);
  --chela-text-tertiary:  var(--chela-slate-400);
  --chela-text-muted:     var(--chela-slate-400);
  --chela-text-inverse:   #ffffff;

  /* === 主色 === */
  --chela-accent:         var(--chela-500);
  --chela-accent-hover:   var(--chela-600);
  --chela-accent-active:  var(--chela-700);
  --chela-accent-subtle:  var(--chela-100);
  --chela-accent-text:    var(--chela-700);

  /* === 思考状态 === */
  --chela-thinking-bg:    #f3e8ff;
  --chela-thinking-text:  var(--chela-thinking);

  /* === 工具状态 === */
  --chela-tool-running:   var(--chela-accent-subtle);
  --chela-tool-complete:  var(--chela-success);
  --chela-tool-error:     var(--chela-error);

  /* === 阴影 === */
  --chela-shadow-sm:  0 1px 2px rgba(0, 0, 0, 0.05);
  --chela-shadow-md:  0 4px 6px rgba(0, 0, 0, 0.07);
  --chela-shadow-lg:  0 10px 15px rgba(0, 0, 0, 0.1);
  --chela-shadow-xl:  0 20px 25px rgba(0, 0, 0, 0.15);
}
```

### Dark Mode (深色模式)

```css
.dark {
  /* === 背景 === */
  --chela-bg-primary:   var(--chela-slate-950);
  --chela-bg-secondary: var(--chela-slate-900);
  --chela-bg-tertiary:  var(--chela-slate-800);
  --chela-bg-surface:   var(--chela-slate-800);
  --chela-bg-muted:     var(--chela-slate-900);

  /* === 边框 === */
  --chela-border:       var(--chela-slate-700);
  --chela-border-muted: var(--chela-slate-800);
  --chela-border-focus: var(--chela-500);

  /* === 文字 === */
  --chela-text-primary:   var(--chela-slate-100);
  --chela-text-secondary: var(--chela-slate-400);
  --chela-text-tertiary:  var(--chela-slate-500);
  --chela-text-muted:     var(--chela-slate-500);
  --chela-text-inverse:   var(--chela-slate-900);

  /* === 主色 === */
  --chela-accent:         var(--chela-400);      /* 深色模式下用稍浅的橙 */
  --chela-accent-hover:   var(--chela-500);
  --chela-accent-active:  var(--chela-600);
  --chela-accent-subtle:  rgba(249, 115, 22, 0.1);
  --chela-accent-text:    var(--chela-400);

  /* === 思考状态 === */
  --chela-thinking-bg:    rgba(167, 139, 250, 0.1);
  --chela-thinking-text:  #c4b5fd;

  /* === 工具状态 === */
  --chela-tool-running:   rgba(249, 115, 22, 0.08);
  --chela-tool-complete:  var(--chela-success);
  --chela-tool-error:     var(--chela-error);

  /* === 阴影（深色模式用更柔和的阴影）=== */
  --chela-shadow-sm:  0 1px 2px rgba(0, 0, 0, 0.3);
  --chela-shadow-md:  0 4px 6px rgba(0, 0, 0, 0.4);
  --chela-shadow-lg:  0 10px 15px rgba(0, 0, 0, 0.5);
  --chela-shadow-xl:  0 20px 25px rgba(0, 0, 0, 0.6);
}
```

## Component Tokens

### 消息气泡

```css
--chela-message-user-bg:      var(--chela-accent);
--chela-message-user-text:    var(--chela-text-inverse);
--chela-message-assistant-bg: transparent;
--chela-message-assistant-text: var(--chela-text-primary);
--chela-message-radius:       12px;
```

### 活动条（Activity Bar）

```css
--chela-activity-bar-bg:        var(--chela-bg-muted);
--chela-activity-bar-border:    var(--chela-border-muted);
--chela-activity-bar-radius:    10px;
--chela-activity-bar-padding:   8px 12px;
--chela-activity-bar-row-gap:   6px;
--chela-activity-bar-font-size: 12px;
```

### 工具卡片

```css
--chela-tool-card-bg:       var(--chela-bg-surface);
--chela-tool-card-border:   var(--chela-border);
--chela-tool-card-radius:   8px;
--chela-tool-card-padding:  10px 14px;
```

### 思考面板

```css
--chela-thinking-panel-bg:    var(--chela-thinking-bg);
--chela-thinking-panel-border: var(--chela-thinking);
--chela-thinking-panel-radius: 10px;
```

## Layer & Structure Tokens

### Z-Index 层级系统

```css
/* === Z-Index 规范 === */
--chela-z-hide: -1;
--chela-z-base: 0;
--chela-z-elevated: 10;     /* 悬浮输入框 / Sticky Header */
--chela-z-dropdown: 40;     /* 下拉菜单 / Popover */
--chela-z-modal: 50;        /* 弹窗背景与容器 */
--chela-z-toast: 100;       /* 全局通知 / Message */
--chela-z-max: 9999;
```

### 全局圆角系统

```css
/* === Border Radius === */
--chela-radius-sm: 4px;      /* 小标签、复选框 */
--chela-radius-md: 8px;      /* 按钮、工具栏、下拉框 */
--chela-radius-lg: 12px;     /* 消息气泡、内部卡片 */
--chela-radius-xl: 16px;     /* 大容器、主面板 */
--chela-radius-full: 9999px; /* 头像、胶囊按钮 */
```

### 毛玻璃与模糊特效

```css
/* === Blur & Glass === */
--chela-blur-sm: blur(4px);
--chela-blur-md: blur(8px);
--chela-blur-lg: blur(16px);

/* Light Mode */
--chela-glass-bg: rgba(255, 255, 255, 0.7);
--chela-glass-border: rgba(255, 255, 255, 0.4);
```

深色模式下：

```css
--chela-glass-bg: rgba(15, 23, 42, 0.7);
--chela-glass-border: rgba(255, 255, 255, 0.1);
```

### 滚动条与文本选中

```css
/* === Scrollbar & Selection === */
--chela-scrollbar-w: 6px;
--chela-scrollbar-track: transparent;
--chela-scrollbar-thumb: var(--chela-slate-300);
--chela-scrollbar-thumb-hover: var(--chela-slate-400);

/* 文本选中 */
--chela-selection-bg: var(--chela-200);
--chela-selection-text: var(--chela-900);
```

## Typography

```css
--chela-font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--chela-font-mono: "JetBrains Mono", "Fira Code", "Consolas", monospace;

--chela-text-xs:   11px;
--chela-text-sm:   12px;
--chela-text-base: 14px;
--chela-text-lg:   16px;
--chela-text-xl:   18px;
--chela-text-2xl:  24px;
--chela-text-3xl:  32px;
```

## Spacing

```css
--chela-space-1:  4px;
--chela-space-2:  8px;
--chela-space-3:  12px;
--chela-space-4:  16px;
--chela-space-5:  20px;
--chela-space-6:  24px;
--chela-space-8:  32px;
--chela-space-10: 40px;
--chela-space-12: 48px;
--chela-space-16: 64px;
```

## Animations

```css
--chela-transition-fast:   150ms ease;
--chela-transition-base:   200ms ease;
--chela-transition-slow:   300ms ease;
--chela-transition-spring: 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
```

## Tailwind Config Mapping

```javascript
// tailwind.config.js 映射
module.exports = {
  theme: {
    extend: {
      colors: {
        chela: {
          50:  'var(--chela-50)',
          100: 'var(--chela-100)',
          200: 'var(--chela-200)',
          300: 'var(--chela-300)',
          400: 'var(--chela-400)',
          500: 'var(--chela-500)',
          600: 'var(--chela-600)',
          700: 'var(--chela-700)',
          800: 'var(--chela-800)',
          900: 'var(--chela-900)',
          950: 'var(--chela-950)',
        },
      },
    },
  },
}
```

---

> **设计说明**：
> - 橙色系来自蟹壳，温暖有活力
> - 蓝灰色系来自深海，沉稳有极客感
> - 紫色用于"思考"状态，神秘但有科技感
> - 深色模式下橙色稍浅，保证对比度
> - 整体感觉：温暖但不甜腻，专业但不冷冰冰 🦀
