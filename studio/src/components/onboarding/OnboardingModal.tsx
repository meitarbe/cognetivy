import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { CliSimulator } from "./CliSimulator";

export interface OnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user dismisses the modal. neverShowAgain is true when "Don't show this again" was checked. */
  onClose: (neverShowAgain: boolean) => void;
}

export function OnboardingModal({ open, onOpenChange, onClose }: OnboardingModalProps) {
  const [neverShowAgain, setNeverShowAgain] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      onClose(false);
    }
    onOpenChange(nextOpen);
  }

  function handleGotIt() {
    onClose(neverShowAgain);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl gap-8 p-8"
        showCloseButton={true}
      >
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-semibold">
            Get started with Cognetivy Studio
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            This Studio shows your workflows and runs. To see data here, talk to the AI that
            already lives in your editor - Cursor, Claude Code, or another AI assistant - and ask it
            to create workflows and start runs.
          </DialogDescription>
          <p className="text-xs text-foreground font-medium pl-2.5 py-1 mt-2">
          </p>
        </DialogHeader>
        <div className="space-y-6">
          <p className="text-sm text-foreground/90">
            In your editor&apos;s chat, ask <strong>your</strong> AI (Claude Code, Cursor, OpenClaw, etc.) to
            create a workflow, then start a run. Once it does, you&apos;ll see the workflow and
            runs here.
          </p>
          <CliSimulator />
        </div>
        <DialogFooter className="flex flex-col-reverse gap-4 sm:flex-row sm:justify-between sm:items-center pt-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            <Checkbox
              checked={neverShowAgain}
              onCheckedChange={(value) => setNeverShowAgain(value === true)}
              aria-label="Don't show this again"
            />
            <span>Don&apos;t show this again</span>
          </label>
          <button
            type="button"
            onClick={handleGotIt}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            Got it
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
