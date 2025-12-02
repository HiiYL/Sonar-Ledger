import { useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { serializeBackupData, parseBackupData, type BackupData } from '../lib/backup';
import type { StatementInfo } from '../types';

interface JsonBackupProps {
  statements: StatementInfo[];
  userMappings: Map<string, string>;
  onDataLoaded: (statements: StatementInfo[], mappings: Map<string, string>) => void;
}

export function JsonBackup({ statements, userMappings, onDataLoaded }: JsonBackupProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const data = serializeBackupData(statements, userMappings);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonar-ledger-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text) as BackupData;
      
      // Validate basic structure
      if (!data.statements || !Array.isArray(data.statements)) {
        throw new Error('Invalid backup file: missing statements array');
      }

      const { statements: loadedStatements, userMappings: loadedMappings } = parseBackupData(data);
      onDataLoaded(loadedStatements, loadedMappings);
      
      // Reset input so same file can be selected again
      e.target.value = '';
    } catch (err) {
      console.error('Failed to import backup:', err);
      alert('Failed to import backup file. Please check the file format.');
      e.target.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
      
      <button
        onClick={handleImportClick}
        className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
        title="Import from JSON file"
      >
        <Upload className="w-4 h-4" />
        <span className="hidden sm:inline">Import</span>
      </button>
      
      <button
        onClick={handleExport}
        disabled={statements.length === 0}
        className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
        title="Export to JSON file"
      >
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">Export</span>
      </button>
    </div>
  );
}
