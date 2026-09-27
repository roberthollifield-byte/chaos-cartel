// Spectator waiver text: used at spectator checkout and on the plus 1 waiver page.
export function SpectatorWaiverText({ className = "" }: { className?: string }) {
  return (
    <div className={`p-4 rounded-lg bg-card border border-cc-purple/30 max-h-56 overflow-y-auto text-sm text-muted-foreground space-y-2 ${className}`} data-testid="text-spectator-waiver">
      <p><strong>ASSUMPTION OF RISK.</strong> Drifting is a dangerous motorsport. Even in spectator areas, you may be exposed to cars losing control, flying debris (tire pieces, rocks, parts), tire smoke, loud noise, and moving vehicles in the pit and parking areas. Injury and death are possible. You voluntarily accept these risks.</p>
      <p><strong>STAY IN SPECTATOR AREAS.</strong> You will stay behind barriers and in marked spectator zones, never enter the track or hot pit, and follow all instructions from Chaos Cartel crew, marshals, and track staff. You may be removed without refund for ignoring safety rules.</p>
      <p><strong>RELEASE.</strong> You release Chaos Cartel, FC Crew, the track owner, all crew, volunteers, and participants from any claim arising out of your attendance, whether from negligence or otherwise, to the maximum extent permitted by law.</p>
      <p><strong>MEDICAL.</strong> You authorize emergency medical treatment if required. Hearing protection is strongly recommended.</p>
      <p><strong>MINORS.</strong> Spectators under 18 must be accompanied by a parent or guardian. If you are buying this ticket for a minor, you are signing as their parent or guardian and accept these terms on their behalf.</p>
      <p><strong>MEDIA.</strong> Photos and video captured at the event may be used by Chaos Cartel for promotion.</p>
      <p><strong>CONDUCT.</strong> Alcohol and controlled substances are prohibited on-site until the day is called.</p>
      <p>By typing your name and checking below, you agree to this waiver as a legally binding electronic signature.</p>
    </div>
  );
}
