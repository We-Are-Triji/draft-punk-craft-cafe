import { CameraIcon } from "lucide-react";

export function ScanScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
      <div className="w-24 h-24 rounded-full bg-amber-800/10 flex items-center justify-center">
        <CameraIcon className="w-12 h-12 text-amber-800" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Scan Ingredient</h2>
        <p className="text-muted-foreground mt-2">
          Point your camera at a barcode or ingredient to scan
        </p>
      </div>
      <button className="px-6 py-3 bg-amber-800 text-white rounded-lg font-medium hover:bg-amber-900 transition-colors">
        Start Scanning
      </button>
    </div>
  );
}