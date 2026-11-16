import { useState } from "react";
import { Check, Star, Zap } from "lucide-react";
import openAI from "../assets/icons/OpenAI.svg";
import anthropic from "../assets/icons/Anthropic.svg";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { SearchField } from "./text-field";
import { Picker } from "./picker";
import { PermissionSelect, type PermissionSelectProps } from "./permission-select";

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
  fastMode?: { enabled: boolean; onChange: (enabled: boolean) => void };
  permission?: PermissionSelectProps;
};

const providerIcons: Readonly<Record<string, string>> = { openai: openAI, anthropic };

function ProviderIcon({ model }: { model: ModelOption }) {
  const src = model.providerIcon ?? providerIcons[model.provider.toLowerCase()];
  return src ? <img width="16" height="16" alt="" src={src} /> : <span aria-hidden="true">{model.provider.slice(0, 1)}</span>;
}

function effortFor(model: ModelOption, current: string | null) {
  if (current && model.efforts.includes(current)) return current;
  if (model.defaultEffort && model.efforts.includes(model.defaultEffort)) return model.defaultEffort;
  return model.efforts[0] ?? null;
}

export function ModelSelect(props: Props) {
  const selected = props.models.find(model => model.id === props.value.modelId);
  const title = [selected?.label ?? "选择模型", selected && effortFor(selected, props.value.effort)].filter(Boolean).join(" · ");
  return <Picker label={`模型与推理强度：${title}`} trigger={title} section="model">
    <ModelOptions {...props} selected={selected} />
  </Picker>;
}

function ModelOptions({ models, value, selected, onChange, onFavoriteChange, fastMode, permission }: Props & { selected?: ModelOption }) {
  const [provider, setProvider] = useState<string | null>(selected?.provider ?? models[0]?.provider ?? null);
  const [query, setQuery] = useState("");
  const providers = Array.from(new Map(models.map(model => [model.provider, model])).values());
  const filter = query.trim().toLowerCase();
  const visible = models.filter(model => (provider === null ? model.favorite : model.provider === provider)
    && (model.label + " " + model.id).toLowerCase().includes(filter));
  const effort = selected && effortFor(selected, value.effort);
  return <>
    <div className="ui-model-columns">
      <div className="ui-model-providers" role="group" aria-label="模型分类">
        <IconButton aria-label="收藏" aria-pressed={provider === null} onClick={() => setProvider(null)}><Star size={16} /></IconButton>
        {providers.map(model => <IconButton key={model.provider} aria-label={model.provider} title={model.provider}
          aria-pressed={provider === model.provider} onClick={() => setProvider(model.provider)}><ProviderIcon model={model} /></IconButton>)}
      </div>
      <div className="ui-model-list">
        <SearchField aria-label="搜索模型" placeholder="搜索模型…" value={query} onChange={event => setQuery(event.target.value)} />
        {visible.map(model => <div className="ui-model-row" key={model.id} data-current={model.id === value.modelId}>
          <Button variant="ghost" aria-pressed={model.id === value.modelId}
            onClick={() => onChange({ modelId: model.id, effort: effortFor(model, value.effort) })}>
            <ProviderIcon model={model} /><span>{model.label}</span>{model.id === value.modelId && <Check size={16} />}
          </Button>
          <IconButton aria-label={`${model.favorite ? "取消收藏" : "收藏"} ${model.label}`} aria-pressed={model.favorite}
            onClick={() => onFavoriteChange(model.id, !model.favorite)}><Star size={16} fill={model.favorite ? "currentColor" : "none"} /></IconButton>
        </div>)}
        {!visible.length && <small role="status">{query ? "没有匹配的模型" : provider === null ? "暂无收藏模型" : "暂无模型"}</small>}
      </div>
      <div className="ui-model-efforts" role="group" aria-label="思考强度">
        <div className="ui-picker-heading">思考强度<span>{selected?.label}</span></div>
        {selected?.efforts.map(level => <Button variant="ghost" key={level} aria-pressed={effort === level}
          onClick={() => onChange({ modelId: selected.id, effort: level })}>{level}{effort === level && <Check size={16} />}</Button>)}
        {!selected?.efforts.length && <small>{selected ? "此模型不支持调整" : "请先选择模型"}</small>}
      </div>
    </div>
    {(fastMode || permission) && <footer className="ui-picker-footer">
      {fastMode && <IconButton aria-label="快速模式" title="快速模式" aria-pressed={fastMode.enabled}
        onClick={() => fastMode.onChange(!fastMode.enabled)}><Zap size={16} /></IconButton>}
      {permission && <PermissionSelect {...permission} />}
    </footer>}
  </>;
}
