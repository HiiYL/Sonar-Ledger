import { Upload } from 'lucide-react';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isLoading: boolean;
}

export function FileUpload({ onFilesSelected, isLoading }: FileUploadProps) {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === 'application/pdf'
    );
    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
    >
      <input
        type="file"
        accept=".pdf"
        multiple
        onChange={handleChange}
        className="hidden"
        id="file-upload"
        disabled={isLoading}
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-700">
          {isLoading ? 'Processing...' : 'Drop PDF statements here'}
        </p>
        <p className="text-sm text-gray-500 mt-2">
          or click to select files
        </p>
      </label>
    </div>
  );
}
