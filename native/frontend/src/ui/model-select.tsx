import { useState } from "react";
import { Check, Star, X, Zap } from "lucide-react";
import openAI from "../assets/icons/OpenAI.svg";
import openAIRow from "../assets/icons/OpenAI16.svg";
import anthropic from "../assets/icons/Anthropic.svg";
import openCode from "../assets/icons/OpenCode.png";
import magpie from "../assets/icons/Magpie.svg";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { SearchField } from "./text-field";
import { Picker } from "./picker";
import { PermissionSelect, type PermissionSelectProps } from "./permission-select";
import { HighlightText } from "./highlight-text";

export type ModelOption = {
  id: string;
  label: string;
  provider: string;
  providerIcon?: string;
  efforts: readonly string[];
  defaultEffort?: string;
  favorite: boolean;
};
export type ModelValue = { modelId: string; effort: string | null };
type Props = {
  models: readonly ModelOption[];
  value: ModelValue;
  onChange: (value: ModelValue) => void;
  onFavoriteChange: (id: string, favorite: boolean) => void;
  fastMode?: { enabled: boolean; disabled?:boolean; onChange: (enabled: boolean) => void };
  permission?: PermissionSelectProps;
};

const providerIcons: Readonly<Record<string, string>> = { openai: openAI, anthropic, opencode: openCode, magpie };
const effortLabels: Readonly<Record<string, string>> = { off: "Off", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max", ultra: "Ultra" };

function ProviderIcon({ model }: { model: ModelOption }) {
  const src = model.providerIcon ?? (model.provider.toLowerCase()==="openai" ? openAIRow : providerIcons[model.provider.toLowerCase()]);
  return src ? <img width="16" height="16" alt="" src={src} /> : <span aria-hidden="true">{model.provider.slice(0, 1)}</span>;
}

function effortFor(model: ModelOption, current: string | null) {
  if (current && model.efforts.includes(current)) return current;
  if (model.defaultEffort && model.efforts.includes(model.defaultEffort)) return model.defaultEffort;
  return model.efforts[0] ?? null;
}

export function ModelSelect(props: Props) {
  const [query, setQuery] = useState("");
  const selected = props.models.find(model => model.id === props.value.modelId);
  const effort = selected && effortFor(selected, props.value.effort);
  const title = [selected?.label ?? "选择模型", effort && (effortLabels[effort] || effort)].filter(Boolean).join(" · ");
  return <Picker label={`模型与推理强度：${title}`} trigger={title} section="model" onOpenChange={open=>{if(!open)setQuery("")}}
    onEscapeKeyDown={event=>{if(query){event.preventDefault();setQuery("")}}}>
    <ModelOptions {...props} selected={selected} query={query} setQuery={setQuery} />
  </Picker>;
}

function ModelOptions({ models, value, selected, onChange, onFavoriteChange, fastMode, permission, query, setQuery }: Props & { selected?: ModelOption; query: string; setQuery: (value: string) => void }) {
  const [provider, setProvider] = useState<string | null>(selected?.favorite ? null : selected?.provider.toLowerCase() ?? models[0]?.provider.toLowerCase() ?? null);
  const providers = Array.from(new Map([
    ...["OpenAI", "Anthropic", "OpenCode", "Magpie"].map(provider => [provider.toLowerCase(), { provider }] as const),
    ...models.map(model => [model.provider.toLowerCase(), model] as const),
  ]).values());
  const filter = query.trim().toLowerCase();
  const visible = models.filter(model => (provider === null ? model.favorite : model.provider.toLowerCase() === provider)
    && (model.label + " " + model.id).toLowerCase().includes(filter));
  const effort = selected && effortFor(selected, value.effort);
  return <>
    <div className="ui-model-columns">
      <div className="ui-model-providers" role="group" aria-label="模型分类">
        <IconButton aria-label="收藏" tooltip="收藏模型" aria-pressed={provider === null} onClick={() => setProvider(null)}><Star size={18} fill={provider === null ? "currentColor" : "none"} /></IconButton>
        {providers.map(model => <IconButton key={model.provider} aria-label={model.provider} tooltip={model.provider}
          aria-pressed={provider === model.provider.toLowerCase()} onClick={() => setProvider(model.provider.toLowerCase())}>
          {providerIcons[model.provider.toLowerCase()] ? <img className="ui-provider-logo" src={providerIcons[model.provider.toLowerCase()]} alt="" /> : <span aria-hidden="true">{model.provider.slice(0, 1)}</span>}
        </IconButton>)}
      </div>
      <div className="ui-model-list">
        <div className="ui-model-search"><SearchField aria-label="搜索模型" placeholder="搜索模型…" value={query} onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === "Escape" && query && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); setQuery(""); } }} />
          {query && <IconButton aria-label="清空模型搜索" onClick={() => setQuery("")}><X size={14} /></IconButton>}
        </div>
        {visible.map(model => <div className="ui-model-row" key={model.id} data-current={model.id === value.modelId}>
          <Button variant="ghost" aria-pressed={model.id === value.modelId}
            onClick={() => onChange({ modelId: model.id, effort: effortFor(model, value.effort) })}>
            <ProviderIcon model={model} /><span><HighlightText text={model.label} query={filter} /></span>{model.id === value.modelId && <Check size={14} />}
          </Button>
          <IconButton aria-label={`${model.favorite ? "取消收藏" : "收藏"} ${model.label}`} aria-pressed={model.favorite}
            onClick={() => onFavoriteChange(model.id, !model.favorite)}><Star size={14} fill={model.favorite ? "currentColor" : "none"} /></IconButton>
        </div>)}
        {!visible.length && <div className="ui-model-empty" role="status"><span>{query ? "没有找到匹配的模型" : provider === null ? "暂无收藏模型" : "暂无模型"}</span><small>{query ? "试试模型名称或缩短关键词" : "可在模型设置中配置，或切换左侧分类"}</small>{query && <Button variant="ghost" onClick={() => setQuery("")}>清空搜索</Button>}</div>}
      </div>
      <div className="ui-model-efforts" role="group" aria-label="思考强度">
        <div className="ui-picker-heading">思考强度</div>
        {selected?.efforts.map(level => <Button variant="ghost" key={level} aria-pressed={effort === level}
          onClick={() => onChange({ modelId: selected.id, effort: level })}>{effortLabels[level] || level}{effort === level && <Check size={14} />}</Button>)}
        {!selected?.efforts.length && <small>{selected ? "此模型不支持调整" : "请先选择模型"}</small>}
      </div>
    </div>
    {(fastMode || permission) && <footer className="ui-picker-footer">
      {fastMode && <IconButton aria-label="快速模式" disabled={fastMode.disabled} tooltip={fastMode.disabled?"此模型未声明支持优先处理":`${fastMode.enabled?"快速模式已开启":"快速模式"}：响应更快，用量更多`} aria-pressed={fastMode.enabled}
        onClick={() => fastMode.onChange(!fastMode.enabled)}><Zap size={16} fill={fastMode.enabled?"currentColor":"none"} /></IconButton>}
      {permission && <PermissionSelect {...permission} />}
    </footer>}
  </>;
}
