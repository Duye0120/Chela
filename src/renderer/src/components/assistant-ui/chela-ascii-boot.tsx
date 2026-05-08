import {
  CHELA_CLAW_DOTS_BY_PART,
  CHELA_CLAW_PARTS,
} from "@renderer/components/assistant-ui/chela-dot-claw-pattern";

export function ChelaAsciiBoot() {
  return (
    <section className="chela-ascii-boot" aria-label="Chela 正在启动">
      <div className="chela-dot-claw" aria-hidden="true">
        <div className="chela-dot-claw__matrix">
          {CHELA_CLAW_PARTS.map((part) => (
            <div
              className={`chela-dot-claw__group chela-dot-claw__group--${part}`}
              key={part}
            >
              {CHELA_CLAW_DOTS_BY_PART[part].map((dot) => (
                <span
                  className="chela-dot-claw__dot chela-dot-claw__dot--claw"
                  key={dot.id}
                  style={{
                    animationDelay: `${dot.delay}ms`,
                    left: `${dot.x}%`,
                    opacity: dot.opacity,
                    top: `${dot.y}%`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="chela-ascii-boot__copy" aria-live="polite">
        <p className="chela-ascii-boot__eyebrow">Booting Chela</p>
        <h1>正在拉起 Chela</h1>
        <p>
          会话状态、窗口状态和本地文件能力正在就位。
        </p>
      </div>
    </section>
  );
}
