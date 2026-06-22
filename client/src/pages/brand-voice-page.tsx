import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Mic2, Building2, Target, MessageSquare, ThumbsUp, ThumbsDown, MousePointerClick, MousePointer2, Hash, Pencil, X, Check, Plus, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isBlank } from "@/lib/utils";
import { ImportBrandModal } from "@/components/import-brand-modal";
import type { BrandProfile } from "@shared/schema";

function stripMd(text: string): string {
  return text.replace(/\*\*|__|\*|_|`/g, "").trim();
}

function EditableTagList({
  items,
  onChange,
  placeholder,
  testIdPrefix,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  testIdPrefix: string;
}) {
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    if (newItem.trim()) {
      onChange([...items, newItem.trim()]);
      setNewItem("");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 overflow-hidden">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary" className="gap-1 pr-1 whitespace-normal break-words max-w-full">
            {stripMd(item)}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="ml-1 rounded-sm hover:bg-muted flex-shrink-0"
              data-testid={`${testIdPrefix}-remove-${i}`}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
          data-testid={`${testIdPrefix}-input`}
        />
        <Button variant="outline" size="icon" onClick={addItem} data-testid={`${testIdPrefix}-add`}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function TagList({ items, testId }: { items: string[] | null; testId: string }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-muted-foreground">None defined yet</p>;
  }
  return (
    <div className="flex flex-wrap gap-2 overflow-hidden" data-testid={testId}>
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className="whitespace-normal break-words max-w-full">{stripMd(item)}</Badge>
      ))}
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

export default function BrandVoicePage() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<BrandProfile>>({});
  const [isImportOpen, setIsImportOpen] = useState(false);

  const { data: brandProfile, isLoading } = useQuery<BrandProfile>({
    queryKey: ["/api/brand-profile"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<BrandProfile>) => {
      const res = await apiRequest("PATCH", "/api/brand-profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-profile"] });
      setIsEditing(false);
      toast({ title: "Brand profile updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to save changes", description: error.message, variant: "destructive" });
    },
  });

  const startEditing = () => {
    if (brandProfile) {
      setEditData({
        companyName: brandProfile.companyName,
        industry: brandProfile.industry,
        brandSummary: brandProfile.brandSummary,
        targetAudience: brandProfile.targetAudience,
        toneStyle: brandProfile.toneStyle,
        messagingPillars: brandProfile.messagingPillars ? [...brandProfile.messagingPillars] : [],
        doLanguageRules: brandProfile.doLanguageRules ? [...brandProfile.doLanguageRules] : [],
        dontLanguageRules: brandProfile.dontLanguageRules ? [...brandProfile.dontLanguageRules] : [],
        ctaPreferences: brandProfile.ctaPreferences ? [...brandProfile.ctaPreferences] : [],
        customCtas: brandProfile.customCtas ? [...brandProfile.customCtas] : [],
        hashtagThemes: brandProfile.hashtagThemes ? [...brandProfile.hashtagThemes] : [],
      });
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditData({});
  };

  const saveEdits = () => {
    updateMutation.mutate(editData);
  };

  const isCompanyNameInvalid = isBlank(editData.companyName);
  const isIndustryInvalid = isBlank(editData.industry);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (!brandProfile) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold mb-1">Brand Voice</h1>
          <p className="text-muted-foreground text-sm">Your brand identity and voice profile</p>
        </div>
        <Card className="flex flex-col items-center justify-center py-20 px-6">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Mic2 className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No brand profile yet</h2>
          <p className="text-muted-foreground text-center max-w-md text-sm">
            Complete the onboarding process to generate your brand voice profile.
          </p>
        </Card>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold mb-1">Edit Brand Voice</h1>
            <p className="text-muted-foreground text-sm">
              {brandProfile.companyName} — {brandProfile.industry}
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={cancelEditing} className="flex-1 sm:flex-initial" data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={saveEdits} disabled={updateMutation.isPending || isCompanyNameInvalid || isIndustryInvalid} className="gap-2 flex-1 sm:flex-initial" data-testid="button-save-edit">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Changes
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card className="p-5 space-y-3">
            <Label className="text-sm font-semibold">Company Name</Label>
            <Input
              value={editData.companyName || ""}
              onChange={(e) => setEditData({ ...editData, companyName: e.target.value })}
              aria-invalid={isCompanyNameInvalid}
              data-testid="edit-company-name"
            />
            {isCompanyNameInvalid && (
              <p className="text-sm text-destructive" data-testid="error-brand-company-name">
                Company name cannot be empty or contain only spaces.
              </p>
            )}
          </Card>
          <Card className="p-5 space-y-3">
            <Label className="text-sm font-semibold">Industry</Label>
            <Input
              value={editData.industry || ""}
              onChange={(e) => setEditData({ ...editData, industry: e.target.value })}
              aria-invalid={isIndustryInvalid}
              data-testid="edit-industry"
            />
            {isIndustryInvalid && (
              <p className="text-sm text-destructive" data-testid="error-brand-industry">
                Industry cannot be empty or contain only spaces.
              </p>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Brand Summary</h3>
            </div>
            <Textarea
              value={editData.brandSummary || ""}
              onChange={(e) => setEditData({ ...editData, brandSummary: e.target.value })}
              className="min-h-[100px]"
              data-testid="edit-brand-summary"
            />
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Target className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Target Audience</h3>
            </div>
            <Textarea
              value={editData.targetAudience || ""}
              onChange={(e) => setEditData({ ...editData, targetAudience: e.target.value })}
              className="min-h-[100px]"
              data-testid="edit-target-audience"
            />
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Tone Style</h3>
            </div>
            <Input
              value={editData.toneStyle || ""}
              onChange={(e) => setEditData({ ...editData, toneStyle: e.target.value })}
              data-testid="edit-tone-style"
            />
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Mic2 className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Messaging Pillars</h3>
            </div>
            <EditableTagList
              items={editData.messagingPillars || []}
              onChange={(items) => setEditData({ ...editData, messagingPillars: items })}
              placeholder="Add a messaging pillar"
              testIdPrefix="edit-messaging-pillars"
            />
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ThumbsUp className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Do Language Rules</h3>
            </div>
            <EditableTagList
              items={editData.doLanguageRules || []}
              onChange={(items) => setEditData({ ...editData, doLanguageRules: items })}
              placeholder="Add a do rule"
              testIdPrefix="edit-do-rules"
            />
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ThumbsDown className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Don't Language Rules</h3>
            </div>
            <EditableTagList
              items={editData.dontLanguageRules || []}
              onChange={(items) => setEditData({ ...editData, dontLanguageRules: items })}
              placeholder="Add a don't rule"
              testIdPrefix="edit-dont-rules"
            />
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MousePointerClick className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">CTA Preferences</h3>
            </div>
            <EditableTagList
              items={editData.ctaPreferences || []}
              onChange={(items) => setEditData({ ...editData, ctaPreferences: items })}
              placeholder="Add a CTA preference"
              testIdPrefix="edit-cta-prefs"
            />
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MousePointer2 className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Custom CTAs</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Appear in the Call-to-Action dropdown when creating a campaign, alongside the defaults.
            </p>
            <EditableTagList
              items={editData.customCtas || []}
              onChange={(items) => setEditData({ ...editData, customCtas: items })}
              placeholder="e.g. Book a Demo"
              testIdPrefix="edit-custom-ctas"
            />
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Hash className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Hashtag Themes</h3>
            </div>
            <EditableTagList
              items={editData.hashtagThemes || []}
              onChange={(items) => setEditData({ ...editData, hashtagThemes: items })}
              placeholder="Add a hashtag theme"
              testIdPrefix="edit-hashtag-themes"
            />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold mb-1">Brand Voice</h1>
          <p className="text-muted-foreground text-sm">
            {brandProfile.companyName} — {brandProfile.industry}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => setIsImportOpen(true)} className="gap-2 w-full sm:w-auto" data-testid="button-import-brand">
            <Sparkles className="w-4 h-4" />
            Import from past chats
          </Button>
          <Button variant="outline" onClick={startEditing} className="gap-2 w-full sm:w-auto" data-testid="button-edit-profile">
            <Pencil className="w-4 h-4" />
            Edit Profile
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard icon={Building2} title="Brand Summary">
          <p className="text-sm leading-relaxed" data-testid="text-brand-summary">
            {brandProfile.brandSummary || "Not defined"}
          </p>
        </SectionCard>

        <SectionCard icon={Target} title="Target Audience">
          <p className="text-sm leading-relaxed" data-testid="text-target-audience">
            {brandProfile.targetAudience || "Not defined"}
          </p>
        </SectionCard>

        <SectionCard icon={MessageSquare} title="Tone Style">
          <p className="text-sm leading-relaxed" data-testid="text-tone-style">
            {brandProfile.toneStyle || "Not defined"}
          </p>
        </SectionCard>

        <SectionCard icon={Mic2} title="Messaging Pillars">
          <TagList items={brandProfile.messagingPillars} testId="tags-messaging-pillars" />
        </SectionCard>

        <SectionCard icon={ThumbsUp} title="Do Language Rules">
          <TagList items={brandProfile.doLanguageRules} testId="tags-do-rules" />
        </SectionCard>

        <SectionCard icon={ThumbsDown} title="Don't Language Rules">
          <TagList items={brandProfile.dontLanguageRules} testId="tags-dont-rules" />
        </SectionCard>

        <SectionCard icon={MousePointerClick} title="CTA Preferences">
          <TagList items={brandProfile.ctaPreferences} testId="tags-cta-prefs" />
        </SectionCard>

        <SectionCard icon={MousePointer2} title="Custom CTAs">
          <TagList items={brandProfile.customCtas} testId="tags-custom-ctas" />
        </SectionCard>

        <SectionCard icon={Hash} title="Hashtag Themes">
          <TagList items={brandProfile.hashtagThemes} testId="tags-hashtag-themes" />
        </SectionCard>
      </div>

      {(brandProfile.sampleLinkedinPost || brandProfile.sampleInstagramPost) && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Sample Posts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {brandProfile.sampleLinkedinPost && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">in</span>
                  </div>
                  <span className="font-semibold text-sm">LinkedIn</span>
                  <Badge variant="secondary" className="ml-auto text-xs">150-250 words</Badge>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed" data-testid="text-sample-linkedin">
                  {brandProfile.sampleLinkedinPost}
                </p>
              </Card>
            )}
            {brandProfile.sampleInstagramPost && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}>
                    <span className="text-white text-xs font-bold">ig</span>
                  </div>
                  <span className="font-semibold text-sm">Instagram</span>
                  <Badge variant="secondary" className="ml-auto text-xs">50-150 words</Badge>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed" data-testid="text-sample-instagram">
                  {brandProfile.sampleInstagramPost}
                </p>
              </Card>
            )}
          </div>
        </div>
      )}

      <ImportBrandModal
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        brandProfile={brandProfile}
      />
    </div>
  );
}
