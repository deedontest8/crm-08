import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, Mail, Linkedin, Phone, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

type AiKind = "email" | "linkedin-connection" | "linkedin-followup" | "phone";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignContext: {
    campaign_name: string;
    campaign_type?: string;
    goal?: string;
    regions?: string[];
    selectedCountries?: string[];
    accountCount?: number;
    contactCount?: number;
    sampleIndustries?: string[];
    samplePositions?: string[];
  };
}

const KIND_OPTIONS: { id: AiKind; label: string; icon: typeof Mail }[] = [
  { id: "email", label: "Email", icon: Mail },
  { id: "linkedin-connection", label: "LinkedIn Connection", icon: Linkedin },
  { id: "linkedin-followup", label: "LinkedIn Follow-up", icon: MessageSquare },
  { id: "phone", label: "Call Script", icon: Phone },
];

function shortLabel(text: string, max = 30): string {
  const t = text.trim();
  if (!t) return "Generated";
  return t.length > max ? t.slice(0, max).trim() + "…" : t;
}

export function AIGenerateWizard({ open, onOpenChange, campaignId, campaignContext }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Record<AiKind, boolean>>({
    email: true, "linkedin-connection": false, "linkedin-followup": false, phone: false,
  });
  const [context, setContext] = useState("");
  const [tone, setTone] = useState("Professional");
  const [length, setLength] = useState("Short");
  const [generating, setGenerating] = useState(false);

  const toggle = (k: AiKind) => setSelected(prev => ({ ...prev, [k]: !prev[k] }));
  const anySelected = Object.values(selected).some(Boolean);

  const reset = () => {
    setSelected({ email: true, "linkedin-connection": false, "linkedin-followup": false, phone: false });
    setContext("");
    setTone("Professional");
    setLength("Short");
  };

  const saveResult = async (kind: AiKind, result: any) => {
    const nameSuffix = shortLabel(context || campaignContext.campaign_name || "Template");
    if (kind === "email") {
      await supabase.from("campaign_email_templates").insert({
        template_name: `AI – Email – ${nameSuffix}`,
        subject: result.subject || "",
        body: result.body || "",
        email_type: "Initial",
        campaign_id: campaignId,
        created_by: user!.id,
      });
    } else if (kind === "linkedin-connection") {
      await supabase.from("campaign_email_templates").insert({
        template_name: `AI – LinkedIn Conn – ${nameSuffix}`,
        body: result.body || "",
        email_type: "LinkedIn-Connection",
        campaign_id: campaignId,
        created_by: user!.id,
      });
    } else if (kind === "linkedin-followup") {
      await supabase.from("campaign_email_templates").insert({
        template_name: `AI – LinkedIn FU – ${nameSuffix}`,
        body: result.body || "",
        email_type: "LinkedIn-Followup",
        campaign_id: campaignId,
        created_by: user!.id,
      });
    } else if (kind === "phone") {
      await supabase.from("campaign_phone_scripts").insert({
        script_name: `AI – Call Script – ${nameSuffix}`,
        opening_script: result.opening_script || "",
        key_talking_points: JSON.stringify(result.talking_points || []),
        discovery_questions: JSON.stringify(result.discovery_questions || []),
        objection_handling: JSON.stringify(result.objections || []),
        campaign_id: campaignId,
        created_by: user!.id,
      });
    }
  };

  const handleGenerate = async () => {
    if (!anySelected) { toast({ title: "Pick at least one type", variant: "destructive" }); return; }
    if (!context.trim()) { toast({ title: "Add a short context to guide the AI", variant: "destructive" }); return; }

    setGenerating(true);
    const kinds = (Object.keys(selected) as AiKind[]).filter(k => selected[k]);
    let successCount = 0;
    let failCount = 0;
    const failures: string[] = [];

    for (const kind of kinds) {
      try {
        const { data, error } = await supabase.functions.invoke("generate-campaign-template", {
          body: {
            templateType: kind,
            campaignContext,
            userInstructions: context.trim(),
            tone,
            length,
          },
        });
        if (error) throw error;
        if (!data?.success || !data?.result) throw new Error(data?.error || "AI returned no result");
        await saveResult(kind, data.result);
        successCount++;
      } catch (e: any) {
        failCount++;
        failures.push(`${kind}: ${e.message || "failed"}`);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["campaign-email-templates", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-phone-scripts", campaignId] });

    setGenerating(false);

    if (successCount > 0) {
      toast({
        title: `Generated and saved ${successCount} template${successCount !== 1 ? "s" : ""}`,
        description: failCount > 0 ? `${failCount} failed: ${failures.join("; ")}` : undefined,
      });
      onOpenChange(false);
      reset();
    } else {
      toast({ title: "AI generation failed", description: failures.join("; "), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Generate with AI
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pick what to create and describe the angle. Templates are saved with personalization placeholders ({"{first_name}, {company_name}, {position}"}) so they auto-fill per recipient at send time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">What to create</Label>
            <div className="grid grid-cols-2 gap-2">
              {KIND_OPTIONS.map(({ id, label, icon: Icon }) => (
                <label
                  key={id}
                  className="flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={(e) => { e.preventDefault(); toggle(id); }}
                >
                  <Checkbox checked={selected[id]} onCheckedChange={() => toggle(id)} />
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Context / angle *</Label>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={4}
              placeholder='e.g. "Introduce our new SaaS analytics platform for mid-market manufacturers in Europe. Focus on cost savings and quick onboarding."'
              className="text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Professional">Professional</SelectItem>
                  <SelectItem value="Friendly">Friendly</SelectItem>
                  <SelectItem value="Direct">Direct</SelectItem>
                  <SelectItem value="Consultative">Consultative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Length</Label>
              <Select value={length} onValueChange={setLength}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Short">Short</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Long">Long</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={generating || !anySelected || !context.trim()} className="gap-1.5">
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? "Generating…" : "Generate & Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
