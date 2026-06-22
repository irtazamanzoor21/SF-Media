import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowRight } from "lucide-react";
import type { BrandProfile } from "@shared/schema";

export const BRAND_VOICE_FIELDS = [
  "brandSummary",
  "targetAudience",
  "toneStyle",
  "messagingPillars",
  "doLanguageRules",
  "dontLanguageRules",
  "ctaPreferences",
  "hashtagThemes",
] as const;

export type BrandVoiceField = (typeof BRAND_VOICE_FIELDS)[number];
export type FieldAction = "keep" | "replace" | "append";

const SCALAR_FIELDS = new Set<BrandVoiceField>(["brandSummary", "targetAudience", "toneStyle"]);

const FIELD_LABELS: Record<BrandVoiceField, { label: string; help: string }> = {
  brandSummary: { label: "What your brand is about", help: "A short summary of who you are and what you do" },
  targetAudience: { label: "Who you're talking to", help: "Your ideal audience" },
  toneStyle: { label: "How you sound", help: "Your communication tone and style" },
  messagingPillars: { label: "Key things you want to say", help: "Themes that show up in your messaging" },
  doLanguageRules: { label: "Words & phrases you use", help: "Language patterns to lean into" },
  dontLanguageRules: { label: "Words & phrases you avoid", help: "Language patterns to stay away from" },
  ctaPreferences: { label: "How you ask people to take action", help: "Your preferred call-to-action styles" },
  hashtagThemes: { label: "Hashtag topics", help: "Themes for your hashtags" },
};

function stripMd(text: string): string {
  return text.replace(/\*\*|__|\*|_|`/g, "").trim();
}

function isEmpty(v: any): boolean {
  if (v == null) return true;
  if (typeof v === "string") return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function ScalarPreview({ text }: { text: string | null | undefined }) {
  if (!text || !text.trim()) {
    return <p className="text-sm text-muted-foreground italic">Not set yet</p>;
  }
  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>;
}

function ListPreview({ items, currentItems }: { items: any; currentItems?: any }) {
  const arr = Array.isArray(items) ? items.filter((v) => typeof v === "string" && v.trim()) : [];
  if (arr.length === 0) {
    return <p className="text-sm text-muted-foreground italic">Not set yet</p>;
  }
  const currentArr = Array.isArray(currentItems) ? currentItems : [];
  const currentLower = new Set(currentArr.map((v: string) => v.toLowerCase().trim()));
  return (
    <div className="flex flex-wrap gap-2">
      {arr.map((item: string, i: number) => {
        const isNew = currentItems !== undefined && !currentLower.has(item.toLowerCase().trim());
        return (
          <Badge
            key={i}
            variant={isNew ? "default" : "secondary"}
            className="whitespace-normal break-words max-w-full"
          >
            {stripMd(item)}
          </Badge>
        );
      })}
    </div>
  );
}

interface Props {
  current: BrandProfile;
  extracted: Record<string, any>;
  actions: Partial<Record<BrandVoiceField, FieldAction>>;
  onChange: (actions: Partial<Record<BrandVoiceField, FieldAction>>) => void;
}

export function BrandVoiceDiff({ current, extracted, actions, onChange }: Props) {
  const setAction = (field: BrandVoiceField, action: FieldAction) => {
    onChange({ ...actions, [field]: action });
  };

  return (
    <div className="space-y-4">
      {BRAND_VOICE_FIELDS.map((field) => {
        const isScalar = SCALAR_FIELDS.has(field);
        const currentVal = (current as any)[field];
        const extractedVal = extracted[field];
        const extractedEmpty = isEmpty(extractedVal);

        if (extractedEmpty) return null;

        const { label, help } = FIELD_LABELS[field];
        const action = actions[field] || (isEmpty(currentVal) ? "replace" : "keep");

        return (
          <Card key={field} className="p-5" data-testid={`diff-card-${field}`}>
            <div className="mb-3">
              <h3 className="font-semibold text-sm">{label}</h3>
              <p className="text-xs text-muted-foreground">{help}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start mb-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Current</Label>
                {isScalar
                  ? <ScalarPreview text={currentVal} />
                  : <ListPreview items={currentVal} />}
              </div>
              <div className="hidden md:flex items-center justify-center pt-6">
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Extracted</Label>
                {isScalar
                  ? <ScalarPreview text={extractedVal} />
                  : <ListPreview items={extractedVal} currentItems={currentVal} />}
              </div>
            </div>

            <RadioGroup
              value={action}
              onValueChange={(v) => setAction(field, v as FieldAction)}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="keep" id={`${field}-keep`} data-testid={`${field}-keep`} />
                <Label htmlFor={`${field}-keep`} className="text-sm cursor-pointer">Keep mine</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="replace" id={`${field}-replace`} data-testid={`${field}-replace`} />
                <Label htmlFor={`${field}-replace`} className="text-sm cursor-pointer">Use new</Label>
              </div>
              {!isScalar && (
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="append" id={`${field}-append`} data-testid={`${field}-append`} />
                  <Label htmlFor={`${field}-append`} className="text-sm cursor-pointer">Add to existing</Label>
                </div>
              )}
            </RadioGroup>
          </Card>
        );
      })}
    </div>
  );
}

export function defaultActions(current: BrandProfile, extracted: Record<string, any>): Partial<Record<BrandVoiceField, FieldAction>> {
  const out: Partial<Record<BrandVoiceField, FieldAction>> = {};
  for (const field of BRAND_VOICE_FIELDS) {
    const c = (current as any)[field];
    const e = extracted[field];
    if (isEmpty(e)) continue;
    out[field] = isEmpty(c) ? "replace" : "keep";
  }
  return out;
}
