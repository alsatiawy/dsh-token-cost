window.__ModuleLoader__.load({
  id: 'dsh-token-cost',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    const NS = 'token-cost';
    const PLUGIN_ID = 'dsh-token-cost';
    const STYLE_ID = `${PLUGIN_ID}/styles.css`;

    /** Flat keys consumed by the slot-provided `t` function. */
    const zh = {
      'pill.label': 'Token 费用',
      'pill.unknown': '未定价',
      'pricing.peak': '高峰时段',
      'pricing.offPeak': '空闲时段',
      'dialog.title': 'Token 费用',
      'dialog.cacheHit': '缓存命中',
      'dialog.input': '未缓存输入',
      'dialog.cacheRead': '缓存读取',
      'dialog.cacheWrite': '缓存写入',
      'dialog.output': '输出',
      'dialog.peak': '高峰计价',
      'dialog.offPeak': '空闲计价',
      'dialog.models': '分模型',
      'dialog.unpriced': '未定价',
      'dialog.unpricedWarning': '有 {tokens} tokens 未匹配官方价格（{models}），未计入费用。',
      'dialog.note': '按 DeepSeek 官方价格表（{version}）估算，高峰/空闲费率按北京时间自动选择；不含搜索/抓取等非 Token 费用。',
    };

    const en = {
      'pill.label': 'Token cost',
      'pill.unknown': 'Unpriced',
      'pricing.peak': 'Peak hours',
      'pricing.offPeak': 'Off-peak hours',
      'dialog.title': 'Token cost',
      'dialog.cacheHit': 'Cache hit',
      'dialog.input': 'Uncached input',
      'dialog.cacheRead': 'Cache read',
      'dialog.cacheWrite': 'Cache write',
      'dialog.output': 'Output',
      'dialog.peak': 'Peak rate',
      'dialog.offPeak': 'Off-peak rate',
      'dialog.models': 'By model',
      'dialog.unpriced': 'Unpriced',
      'dialog.unpricedWarning': '{tokens} tokens have no official price match ({models}) and are not included in the cost.',
      'dialog.note': 'Estimated with the DeepSeek official price list ({version}); peak and off-peak rates follow Beijing time. Excludes non-token fees such as Search/Fetch.',
    };

    const CSS = `
.tc-anchor{display:inline-flex;min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}
.tc-pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex;cursor:pointer}
.tc-pill svg{flex:none;width:14px;height:14px}
.tc-pill:hover,.tc-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.tc-pill:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.tc-label{text-overflow:ellipsis;min-width:0;overflow:hidden}
.tc-dialog{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,calc(100vw - 24px));max-width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow-y:auto;backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}
.tc-dialog:focus{outline:none}
.tc-title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}
.tc-titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}
.tc-titleLabel svg{flex:none;width:14px;height:14px}
.tc-titleValue{font-variant-numeric:tabular-nums;white-space:nowrap}
.tc-rule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}
.tc-warn{color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-2);border-left:2px solid var(--dsw-alias-state-warn-primary);border-radius:var(--dsw-radius-sm);margin:0 0 10px;padding:6px 8px;overflow-wrap:anywhere}
.tc-details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}
.tc-details dt,.tc-details dd{min-width:0;margin:0}
.tc-details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}
.tc-section{color:var(--dsw-alias-label-primary);margin:12px 0 6px;font-weight:500}
.tc-routeList{display:flex;flex-direction:column;gap:0;max-height:220px;overflow-y:auto}
.tc-route{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:baseline;padding:5px 0;border-top:.5px solid var(--dsw-alias-border-l1)}
.tc-route:first-child{border-top:0}
.tc-routeName{overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}
.tc-routeTokens{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
.tc-routeCost{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
.tc-note{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:11px;line-height:16px}
@media (width <= 480px){.tc-pill{padding:1px 6px;gap:4px}.tc-dialog{min-width:min(280px,calc(100vw - 24px));padding:12px}}
`;

    const TOKEN_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
    const DEFAULT_PEAK_WINDOWS = Object.freeze([
      Object.freeze([9 * 60, 12 * 60]),
      Object.freeze([14 * 60, 18 * 60]),
    ]);

    /** Format an exact non-negative token count with grouping. */
    function formatTokens(value) {
      const count = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
      return TOKEN_FORMAT.format(count);
    }

    /** Format a non-negative cost with a currency symbol and exactly two decimals. */
    function formatCost(value, symbol) {
      const unit = typeof symbol === 'string' && symbol.length > 0 ? symbol : '¥';
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
      return `${unit}${value.toFixed(2)}`;
    }

    /** Format a percentage already expressed in 0-100 units. */
    function formatPercent(value) {
      return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
    }

    /** Pad a positive integer to two digits. */
    function pad2(value) {
      return String(value).padStart(2, '0');
    }

    /**
     * Classify the current instant from the host-provided peak schedule.
     *
     * The schedule carries the Beijing UTC offset, peak windows, and holiday
     * dates so the client never hard-codes a second copy of the calendar.
     * A missing schedule falls back to the standard weekday windows.
     */
    function pricingClassAt(nowMs, schedule) {
      const offsetMinutes = schedule
        && typeof schedule.utcOffsetMinutes === 'number'
        && Number.isFinite(schedule.utcOffsetMinutes)
        ? schedule.utcOffsetMinutes
        : 8 * 60;
      const local = new Date((Number.isFinite(nowMs) ? nowMs : Date.now()) + offsetMinutes * 60_000);
      const weekday = local.getUTCDay();
      if (weekday === 0 || weekday === 6) return 'offPeak';
      const dateKey = `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`;
      const holidays = schedule && Array.isArray(schedule.holidays) ? schedule.holidays : [];
      if (holidays.includes(dateKey)) return 'offPeak';
      const windows = schedule && Array.isArray(schedule.windows) && schedule.windows.length > 0
        ? schedule.windows
        : DEFAULT_PEAK_WINDOWS;
      const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
      for (const window of windows) {
        if (!Array.isArray(window)) continue;
        const start = window[0];
        const end = window[1];
        if (Number.isFinite(start) && Number.isFinite(end) && minutes >= start && minutes < end) {
          return 'peak';
        }
      }
      return 'offPeak';
    }

    /** Track the current pricing class, refreshing at most twice a minute. */
    function usePricingClass(schedule) {
      const [classKey, setClassKey] = React.useState(() => pricingClassAt(Date.now(), schedule));
      const scheduleKey = React.useMemo(() => JSON.stringify(schedule ?? null), [schedule]);
      React.useEffect(() => {
        const update = () => {
          setClassKey((previous) => {
            const next = pricingClassAt(Date.now(), schedule);
            return previous === next ? previous : next;
          });
        };
        update();
        const timer = window.setInterval(update, 30_000);
        document.addEventListener('visibilitychange', update);
        return () => {
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', update);
        };
      }, [scheduleKey]);
      return classKey;
    }

    /** Sun for peak pricing and a crescent moon for off-peak pricing. */
    function PricingIcon({ classKey }) {
      const svgProps = {
        viewBox: '0 0 16 16',
        width: 14,
        height: 14,
        'aria-hidden': true,
        focusable: 'false',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'data-pricing-class': classKey,
      };
      if (classKey === 'peak') {
        return h('svg', svgProps,
          h('circle', { cx: 8, cy: 8, r: 2.8 }),
          h('path', {
            d: 'M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1',
          }),
        );
      }
      return h('svg', svgProps,
        h('path', { d: 'M13.2 9.5A5.9 5.9 0 0 1 6.5 2.8 5.9 5.9 0 1 0 13.2 9.5Z' }),
      );
    }

    /** One detail row pair; keys are supplied by the caller. */
    function detailPair(key, label, value) {
      return [h('dt', { key: `${key}-label` }, label), h('dd', { key: `${key}-value` }, value)];
    }

    /**
     * Anchored details dialog, portaled to the document body.
     *
     * The panel is first laid out invisibly so its real dimensions are known,
     * then clamped inside the viewport above the trigger.
     */
    function CostDialog({ view, t, anchorRef, panelRef, pricingClass }) {
      const [pos, setPos] = React.useState(null);

      React.useLayoutEffect(() => {
        const anchor = anchorRef.current;
        if (anchor === null) return undefined;
        const place = () => {
          const panel = panelRef.current;
          if (panel === null) return;
          const triggerRect = anchor.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const width = panelRect.width || 320;
          const height = panelRect.height || 220;
          const maxLeft = Math.max(12, window.innerWidth - width - 12);
          const left = Math.min(Math.max(12, triggerRect.left), maxLeft);
          const top = Math.max(12, triggerRect.top - height - 8);
          setPos((current) => (current !== null && current.left === left && current.top === top
            ? current
            : { left, top }));
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
          window.removeEventListener('resize', place);
          window.removeEventListener('scroll', place, true);
        };
      }, [anchorRef, panelRef, view]);

      React.useEffect(() => {
        const panel = panelRef.current;
        if (panel !== null) panel.focus();
      }, [panelRef]);

      const symbol = typeof view.symbol === 'string' && view.symbol.length > 0 ? view.symbol : '¥';
      const totals = view.totals !== null && typeof view.totals === 'object' ? view.totals : {};
      const routes = Array.isArray(view.routes) ? view.routes : [];
      const unpricedModels = Array.isArray(view.unpricedModels) ? view.unpricedModels : [];
      const unpricedTokens = typeof view.unpricedTokens === 'number' && Number.isFinite(view.unpricedTokens)
        ? view.unpricedTokens
        : 0;
      const totalCost = typeof totals.cost === 'number' && Number.isFinite(totals.cost) ? totals.cost : 0;
      const titleValue = totalCost > 0 || unpricedTokens === 0 ? formatCost(totalCost, symbol) : '—';
      const peakCost = typeof totals.peakCost === 'number' && Number.isFinite(totals.peakCost) ? totals.peakCost : 0;
      const offPeakCost = typeof totals.offPeakCost === 'number' && Number.isFinite(totals.offPeakCost)
        ? totals.offPeakCost
        : 0;

      const details = [
        ...detailPair('cache-hit', t('dialog.cacheHit'), formatPercent(view.cacheHitPercent)),
        ...detailPair(
          'input',
          t('dialog.input'),
          `${formatTokens(totals.inputTokens)} tok · ${formatCost(totals.inputCost, symbol)}`,
        ),
        ...detailPair(
          'cache-read',
          t('dialog.cacheRead'),
          `${formatTokens(totals.cacheReadTokens)} tok · ${formatCost(totals.cacheReadCost, symbol)}`,
        ),
        ...(typeof totals.cacheWriteTokens === 'number' && totals.cacheWriteTokens > 0
          ? detailPair(
            'cache-write',
            t('dialog.cacheWrite'),
            `${formatTokens(totals.cacheWriteTokens)} tok · ${formatCost(totals.cacheWriteCost, symbol)}`,
          )
          : []),
        ...detailPair(
          'output',
          t('dialog.output'),
          `${formatTokens(totals.outputTokens)} tok · ${formatCost(totals.outputCost, symbol)}`,
        ),
        ...(peakCost > 0 || offPeakCost > 0
          ? [
            ...detailPair('peak', t('dialog.peak'), formatCost(peakCost, symbol)),
            ...detailPair('off-peak', t('dialog.offPeak'), formatCost(offPeakCost, symbol)),
          ]
          : []),
      ];

      const panelStyle = pos === null
        ? { left: 0, top: 0, visibility: 'hidden' }
        : { left: pos.left, top: pos.top };

      return h('div', {
        ref: panelRef,
        className: 'tc-dialog',
        role: 'dialog',
        'aria-label': t('dialog.title'),
        tabIndex: -1,
        style: panelStyle,
      },
        h('div', { className: 'tc-title' },
          h('span', { className: 'tc-titleLabel' }, h(PricingIcon, { classKey: pricingClass }), t('dialog.title')),
          h('span', { className: 'tc-titleValue' }, titleValue),
        ),
        h('div', { className: 'tc-rule', 'aria-hidden': true }),
        unpricedTokens > 0
          ? h('div', { className: 'tc-warn' }, t('dialog.unpricedWarning', {
            tokens: formatTokens(unpricedTokens),
            models: unpricedModels.join(', '),
          }))
          : null,
        h('dl', { className: 'tc-details' }, details),
        routes.length > 0
          ? h('div', { className: 'tc-section' }, t('dialog.models'))
          : null,
        routes.length > 0
          ? h('div', { className: 'tc-routeList' }, routes.map((route, index) => {
            const name = route.provider === 'deepseek-official'
              ? route.model
              : `${route.provider}/${route.model}`;
            const cost = route.priced === true
              ? formatCost(route.cost, symbol)
              : t('dialog.unpriced');
            return h('div', {
              className: 'tc-route',
              key: `${route.provider}/${route.model}/${index}`,
            },
              h('span', { className: 'tc-routeName', title: `${route.provider}/${route.model}` }, name),
              h('span', { className: 'tc-routeTokens' }, `${formatTokens(route.totalTokens)} tok`),
              h('span', { className: 'tc-routeCost' }, cost),
            );
          }))
          : null,
        h('p', { className: 'tc-note' }, t('dialog.note', { version: view.priceVersion || '' })),
      );
    }

    /** The composer-dock cost pill and its details dialog. */
    function CostPill({ useProjection, t, sessionId }) {
      const view = useProjection('tokenCost');
      const [open, setOpen] = React.useState(false);
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const pricingClass = usePricingClass(
        view === null || view === undefined ? undefined : view.peakSchedule,
      );

      React.useEffect(() => {
        setOpen(false);
      }, [sessionId]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        const onPointerDown = (event) => {
          const target = event.target;
          if (!(target instanceof Node)) return;
          if (rootRef.current !== null && rootRef.current.contains(target)) return;
          if (panelRef.current !== null && panelRef.current.contains(target)) return;
          setOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('pointerdown', onPointerDown, true);
        };
      }, [open]);

      const totalTokens = view !== null && view !== undefined && typeof view.totalTokens === 'number'
        ? view.totalTokens
        : 0;
      if (view === null || view === undefined || totalTokens <= 0) return null;

      const symbol = typeof view.symbol === 'string' && view.symbol.length > 0 ? view.symbol : '¥';
      const totals = view.totals !== null && typeof view.totals === 'object' ? view.totals : {};
      const totalCost = typeof totals.cost === 'number' && Number.isFinite(totals.cost) ? totals.cost : 0;
      const unpricedTokens = typeof view.unpricedTokens === 'number' && Number.isFinite(view.unpricedTokens)
        ? view.unpricedTokens
        : 0;
      const label = totalCost > 0 || unpricedTokens === 0 ? formatCost(totalCost, symbol) : t('pill.unknown');
      const pricingLabel = t(pricingClass === 'peak' ? 'pricing.peak' : 'pricing.offPeak');
      const ariaLabel = `${t('pill.label')}: ${label} · ${pricingLabel}`;

      return h('span', { ref: rootRef, className: 'tc-anchor' },
        h('button', {
          type: 'button',
          className: 'tc-pill',
          'data-pricing-class': pricingClass,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-label': ariaLabel,
          title: ariaLabel,
          onClick: () => setOpen((value) => !value),
        },
          h(PricingIcon, { classKey: pricingClass }),
          h('span', { className: 'tc-label' }, label),
        ),
        open
          ? ReactDOM.createPortal(
            h(CostDialog, { view, t, anchorRef: rootRef, panelRef, pricingClass }),
            document.body,
          )
          : null,
      );
    }

    /** Insert the plugin stylesheet and remove it with the plugin effect. */
    function installStyles(ctx) {
      ctx.effect(() => {
        const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`;
        const previous = document.querySelector(selector);
        if (previous !== null) previous.remove();
        const style = document.createElement('style');
        style.dataset.plugin = PLUGIN_ID;
        style.dataset.pluginCss = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => {
          style.remove();
        };
      }, 'token-cost: styles');
    }

    /** Client plugin body: dictionaries, styles, and the composer-dock entry. */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'token-cost: dictionaries');
      installStyles(ctx);
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'token-cost',
        order: 2,
        locale: NS,
      }, CostPill));
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
