import { Check, Hand, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "./button";
import { Picker, PickerClose } from "./picker";

const modes = {
  ask: { label: "请求批准", detail: "编辑工作区外的文件或联网前先询问", icon: Hand },
  auto: { label: "帮我批准", detail: "仅对检测到的风险操作请求批准", icon: ShieldCheck },
  full: { label: "完全访问权限", detail: "允许访问网络及工作区外的文件", icon: ShieldAlert },
};

export type PermissionMode = keyof typeof modes;
export type PermissionSelectProps = {
  value: PermissionMode;
  onChange: (mode: PermissionMode) => void;
  onLearnMore?: () => void;
};

export function PermissionSelect({ value, onChange, onLearnMore }: PermissionSelectProps) {
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
          aria-pressed={mode === value} onClick={() => onChange(mode)}>
          <Icon size={16} /><span>{label}<small>{detail}</small></span>
          {mode === value && <Check size={16} />}
        </Button>
      </PickerClose>;
    })}
  </Picker>;
}
