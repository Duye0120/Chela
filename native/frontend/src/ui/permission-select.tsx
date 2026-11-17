import { Check, Hand, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "./button";
import { Picker, PickerClose } from "./picker";

const modes = {
  ask: { label: "请求批准", detail: "写入工作区文件和调用外部工具前先询问", icon: Hand },
  auto: { label: "帮我批准", detail: "自动写入工作区，外部工具仍请求批准", icon: ShieldCheck },
  full: { label: "完全访问权限", detail: "允许工作区外文件和已启用外部工具；仅用于隔离环境", icon: ShieldAlert },
};

export type PermissionMode = keyof typeof modes;
export type PermissionSelectProps = {
  value: PermissionMode;
  onChange: (mode: PermissionMode) => void;
  onLearnMore?: () => void;
  disabled?:boolean;
};

export function PermissionSelect({ value, onChange, onLearnMore,disabled }: PermissionSelectProps) {
  const CurrentIcon = modes[value].icon;
  return <Picker label={`批准模式：${modes[value].label}`} section="permission"
    trigger={<><CurrentIcon size={16} />{modes[value].label}</>}>
    <div className="ui-picker-heading">如何批准 Chela 的操作？
      {onLearnMore && <Button variant="ghost" onClick={onLearnMore}>了解更多</Button>}
    </div>
    {(Object.keys(modes) as PermissionMode[]).map(mode => {
      const { label, detail, icon: Icon } = modes[mode];
      return <PickerClose asChild key={mode}>
        <Button variant="ghost" className="ui-permission-option" data-mode={mode}
          disabled={disabled} aria-pressed={mode === value} onClick={() => onChange(mode)}>
          <Icon size={16} /><span>{label}<small>{detail}</small></span>
          {mode === value && <Check size={16} />}
        </Button>
      </PickerClose>;
    })}
  </Picker>;
}
