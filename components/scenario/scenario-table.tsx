"use client";

import { useRef } from "react";
import { ChevronRight, UnfoldVertical, FoldVertical } from "lucide-react";
import type { TableRow as ScenarioTableRow } from "@/lib/scenario/table-rows";
import { t, tf, type Lang } from "@/lib/scenario/dictionary";
import { HelpTip } from "@/components/scenario/help-tip";
import { DC } from "@/lib/scenario/design-colors";

// 1列目だけ固定幅、年月列はその列の実際の値の桁数から幅を見積もって指定する
// (以前は全列おなじ幅に均等割りしていたため、桁数の多い列(例: 1,000万円超)
// だけ「¥14,429,…」のように省略されてしまっていた)。テーブル自体をwidth:100%に
// することで、画面が広いときは余白を作らず目一杯使い、見積もった最小幅を
// 下回りそうな狭い画面でだけ横スクロールに切り替わる。
const FIRST_COL_WIDTH = 140;
const YEAR_COL_MIN_WIDTH = 92;
// 金額はほぼ等幅の数字+カンマ+¥記号なので、文字数から列幅をpx換算で見積もる
// (実際のDOM計測はせず、fontSize 12.5pxの目安値で近似する)。
const CHAR_WIDTH_PX = 7.3;
const CELL_HORIZONTAL_PADDING_PX = 24;

function estimateColumnWidth(label: string, rows: ScenarioTableRow[], colIndex: number): number {
  let maxLen = label.length;
  for (const row of rows) {
    const cell = row.cells[colIndex];
    if (!cell) continue;
    maxLen = Math.max(maxLen, cell.fmt.length, cell.delta?.fmt.length ?? 0);
  }
  return Math.max(YEAR_COL_MIN_WIDTH, Math.ceil(maxLen * CHAR_WIDTH_PX) + CELL_HORIZONTAL_PADDING_PX);
}

// position:sticky(top)を横スクロールする要素の中で使うと、CSSの仕様上
// overflow-x:auto指定が同じ要素のoverflow-yも(見た目上は何も起きなくても)
// 非visible化してしまい、sticky の基準がその要素自身になって「ページを
// 縦スクロールしても付いてこない」バグになる(実機検証済み)。
// そのため、ヘッダー行だけを別テーブルとして画面の縦スクロールに乗せ
// (position:sticky top:0はページのスクロールコンテナ基準で正しく効く)、
// 本体テーブルの横スクロールに合わせてJSでヘッダー側のscrollLeftを同期する。
// 「展開する/折りたたむ」ボタン。以前はScenarioTableの直上に固定で表示して
// いたが、年次×単体モードではサマリーカードの行にまとめたいという要望が
// あり、呼び出し側(page.tsx)が好きな位置に置けるよう単体のコンポーネントとして
// 切り出した。
export function ExpandToggleButton({
  expandAll,
  onToggle,
  lang,
}: {
  expandAll: boolean;
  onToggle: () => void;
  lang: Lang;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      {/* 予算比の記号・数字の意味(以前は表の上に常時出していた凡例) */}
      <HelpTip text={t(lang, "budgetDiffLegend")} />
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:brightness-95 active:scale-95 shrink-0"
        style={{ backgroundColor: DC.track, color: DC.textSecondary }}
      >
        {expandAll ? <FoldVertical size={12} /> : <UnfoldVertical size={12} />}
        {expandAll ? t(lang, "collapseAll") : t(lang, "expandAll")}
      </button>
    </div>
  );
}

export function ScenarioTable({
  rows,
  columnLabels,
  firstColumnLabel,
  onToggleRow,
  lang,
  currentColumnLabel = null,
}: {
  rows: ScenarioTableRow[];
  columnLabels: string[];
  firstColumnLabel: string;
  onToggleRow: (key: string) => void;
  lang: Lang;
  // 一致する列(月次表示の当月など)をハイライトする。無ければハイライトしない。
  currentColumnLabel?: string | null;
}) {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  const syncHeaderScroll = () => {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    }
  };

  const colWidths = columnLabels.map((label, i) => estimateColumnWidth(label, rows, i));
  const minTableWidth = FIRST_COL_WIDTH + colWidths.reduce((sum, w) => sum + w, 0);

  // 年月列の幅は、その列の値の桁数から見積もった幅(colWidths)を指定する。
  // table-layout:fixedなので、画面がその合計幅より広ければ均等に引き伸ばされ、
  // 狭ければこの幅を下限に横スクロールに切り替わる。
  const colgroup = (
    <colgroup>
      <col style={{ width: FIRST_COL_WIDTH }} />
      {colWidths.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );


  return (
    <div className="flex flex-col gap-2">
      {/* 注意: このラッパーに overflow-hidden を付けると、それが sticky ヘッダーの
          最も近い「overflowが非visibleな祖先」になってしまい、ページの縦スクロールに
          追従しなくなる(実機で確認済みのバグ)。角丸クリップは代わりにヘッダー/本体
          それぞれの要素に個別のborder-radiusで再現する。 */}
      <div className="rounded-2xl border" style={{ borderColor: DC.cardBorder, backgroundColor: DC.cardBg }}>
        {/* ヘッダー: ページの縦スクロールに乗って上端に固定される。横方向は
            overflow-x:hidden でクリップし、本体側のスクロールに追従させる。 */}
        <div
          ref={headerScrollRef}
          className="sticky top-0 z-20 overflow-x-hidden"
          style={{ backgroundColor: DC.headerBg, borderTopLeftRadius: 15, borderTopRightRadius: 15 }}
        >
          <table style={{ width: "100%", minWidth: minTableWidth, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
            {colgroup}
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-10 text-left whitespace-nowrap font-semibold"
                  style={{
                    backgroundColor: DC.headerBg,
                    color: DC.textFaint,
                    fontSize: 11,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    padding: "11px 16px",
                    borderBottom: `1px solid ${DC.cardBorder}`,
                    borderRight: `1px solid ${DC.cardBorder}`,
                  }}
                >
                  {firstColumnLabel}
                </th>
                {columnLabels.map((label, i) => {
                  const isCurrent = label === currentColumnLabel;
                  return (
                    <th
                      key={i}
                      className="text-right whitespace-nowrap"
                      style={{
                        backgroundColor: DC.headerBg,
                        color: isCurrent ? DC.primaryHover : DC.textPrimary,
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "11px 10px",
                        borderTop: isCurrent ? `1px solid ${DC.primary}` : undefined,
                        borderLeft: isCurrent ? `1px solid ${DC.primary}` : undefined,
                        borderRight: isCurrent ? `1px solid ${DC.primary}` : undefined,
                        borderBottom: `1px solid ${DC.cardBorder}`,
                      }}
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
          </table>
        </div>

        {/* 本体: 横スクロールはここだけに閉じ込める(縦はページ全体に任せる)。 */}
        <div
          ref={bodyScrollRef}
          onScroll={syncHeaderScroll}
          className="overflow-x-auto"
          style={{ borderBottomLeftRadius: 15, borderBottomRightRadius: 15, overflowY: "hidden" }}
        >
          <table style={{ width: "100%", minWidth: minTableWidth, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
            {colgroup}
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.key}>
                  <td
                    onClick={row.expandable ? () => onToggleRow(row.key) : undefined}
                    className="sticky left-0 z-10"
                    style={{
                      backgroundColor: DC.cardBg,
                      color: DC.textPrimary,
                      paddingTop: 7,
                      paddingBottom: 7,
                      paddingRight: 16,
                      paddingLeft: 16 + row.depth * 18,
                      fontSize: 12.5,
                      fontWeight: row.bold ? 700 : row.depth === 0 ? 600 : 400,
                      borderBottom: `1px solid ${DC.trackAlt}`,
                      borderRight: `1px solid ${DC.cardBorder}`,
                      cursor: row.expandable ? "pointer" : "default",
                    }}
                  >
                    {/* ラベル自体をmin-w-0の縮小可能な要素にすることで、
                        text-overflow:ellipsisが実際に効くようにする(親のtdや
                        アイコンと同じinline-flexの中に入れたままだと、はみ出す
                        対象がラベルのテキストそのものではなくなり、「…」が出ずに
                        単に途中でぶつ切りになるだけだった)。アイコンはflexShrink:0
                        で縮まないようにし、ラベルだけが縮んで省略される。 */}
                    <span className="flex items-center gap-1.5 w-full min-w-0">
                      {row.expandable && (
                        <ChevronRight
                          size={12}
                          style={{
                            color: DC.textFaint,
                            transform: row.expanded ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 120ms",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span title={row.label} className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {row.label}
                      </span>
                    </span>
                  </td>
                  {row.cells.map((cell, i) => {
                    const isCurrent = columnLabels[i] === currentColumnLabel;
                    const isLastRow = rowIndex === rows.length - 1;
                    return (
                      <td
                        key={i}
                        title={
                          (cell.delta || cell.deltaMark) && cell.budgetFmt !== undefined
                            ? `${cell.fmt} (${tf(lang, "budgetDiffTooltip", { budget: cell.budgetFmt, diff: (cell.delta ?? cell.deltaMark)!.fmt })})`
                            : cell.delta
                              ? `${cell.fmt} (${cell.delta.fmt})`
                              : cell.fmt
                        }
                        className="text-right whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{
                          padding: "7px 10px",
                          fontSize: 12.5,
                          fontWeight: row.bold ? 700 : row.depth === 0 ? 600 : 400,
                          color: cell.negative ? DC.danger : DC.textPrimary,
                          backgroundColor: isCurrent ? "rgba(190,91,133,0.05)" : undefined,
                          borderLeft: isCurrent ? `1px solid ${DC.primary}` : undefined,
                          borderRight: isCurrent ? `1px solid ${DC.primary}` : undefined,
                          borderBottom: isCurrent && isLastRow ? `1px solid ${DC.primary}` : `1px solid ${DC.trackAlt}`,
                        }}
                      >
                        {cell.fmt}
                        {cell.deltaMark && (
                          <span
                            style={{
                              display: "inline-block",
                              width: 10,
                              marginLeft: 3,
                              textAlign: "center",
                              fontSize: 11,
                              fontWeight: 700,
                              color:
                                cell.deltaMark.mark === "+"
                                  ? DC.danger
                                  : cell.deltaMark.mark === "−"
                                    ? DC.success
                                    : DC.textFaint,
                            }}
                          >
                            {cell.deltaMark.mark}
                          </span>
                        )}
                        {cell.delta && (
                          <div
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              color: cell.delta.positive ? DC.success : DC.danger,
                              marginTop: 1,
                            }}
                          >
                            {cell.delta.fmt}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
