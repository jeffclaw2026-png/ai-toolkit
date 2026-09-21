'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal';
import Link from 'next/link';
import { TextInput } from '@/components/formInputs';
import useDatasetList from '@/hooks/useDatasetList';
import { Button } from '@headlessui/react';
import { FaRegTrashAlt } from 'react-icons/fa';
import { openConfirm } from '@/components/ConfirmModal';
import { TopBar, MainContent } from '@/components/layout';
import UniversalTable, { TableColumn } from '@/components/UniversalTable';
import { apiClient } from '@/utils/api';
import { useRouter } from 'next/navigation';

export default function Datasets() {
  const router = useRouter();
  const { datasets, status, refreshDatasets } = useDatasetList();
  const [newDatasetName, setNewDatasetName] = useState('');
  const [isNewDatasetModalOpen, setIsNewDatasetModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [lrUrl, setLrUrl] = useState('http://192.168.50.113:8300');
  const [lrDatasets, setLrDatasets] = useState<string[]>([]);
  const [lrSelected, setLrSelected] = useState('');
  const [lrIncludeCaptions, setLrIncludeCaptions] = useState(true);
  const [lrLoading, setLrLoading] = useState(false);
  const [lrStatus, setLrStatus] = useState('');

  const openImportModal = async () => {
    setIsImportModalOpen(true);
    setLrStatus('Loading datasets from LoRA Review...');
    setLrDatasets([]);
    setLrSelected('');
    try {
      const res = await fetch(`/api/datasets/lorareview-list?url=${encodeURIComponent(lrUrl)}`);
      const data = await res.json();
      if (data.datasets) {
        setLrDatasets(data.datasets.map((d: any) => d.name));
        setLrStatus('');
      } else {
        setLrStatus(data.error || 'Failed to list LoRA Review datasets');
      }
    } catch (e: any) {
      setLrStatus('Cannot reach LoRA Review: ' + e.message);
    }
  };

  const handleImport = async () => {
    if (!lrSelected) return;
    setLrLoading(true);
    setLrStatus('Importing (keep-status images)... this may take a minute for large datasets.');
    try {
      const res = await apiClient.post('/api/datasets/import-lorareview', {
        url: lrUrl,
        dataset: lrSelected,
        includeCaptions: lrIncludeCaptions,
      });
      const data = res.data;
      setLrStatus(`Imported ${data.bytes ? Math.round(data.bytes / 1024 / 1024) : '?'} MB into "${data.dataset}" (${data.captions} captions).`);
      refreshDatasets();
    } catch (e: any) {
      setLrStatus('Import failed: ' + (e?.response?.data?.error || e.message));
    } finally {
      setLrLoading(false);
    }
  };

  // Transform datasets array into rows with objects
  const tableRows = datasets.map(dataset => ({
    name: dataset,
    actions: dataset, // Pass full dataset name for actions
  }));

  const columns: TableColumn[] = [
    {
      title: 'Dataset Name',
      key: 'name',
      render: row => (
        <Link href={`/datasets/${row.name}`} className="text-gray-200 hover:text-gray-100">
          {row.name}
        </Link>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      className: 'w-20 text-right',
      render: row => (
        <button
          className="text-gray-200 hover:bg-red-600 p-2 rounded-full transition-colors"
          onClick={() => handleDeleteDataset(row.name)}
        >
          <FaRegTrashAlt />
        </button>
      ),
    },
  ];

  const handleDeleteDataset = (datasetName: string) => {
    openConfirm({
      title: 'Delete Dataset',
      message: `Are you sure you want to delete the dataset "${datasetName}"? This action cannot be undone.`,
      type: 'warning',
      confirmText: 'Delete',
      onConfirm: () => {
        apiClient
          .post('/api/datasets/delete', { name: datasetName })
          .then(() => {
            console.log('Dataset deleted:', datasetName);
            refreshDatasets();
          })
          .catch(error => {
            console.error('Error deleting dataset:', error);
          });
      },
    });
  };

  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await apiClient.post('/api/datasets/create', { name: newDatasetName }).then(res => res.data);
      console.log('New dataset created:', data);
      refreshDatasets();
      setNewDatasetName('');
      setIsNewDatasetModalOpen(false);
    } catch (error) {
      console.error('Error creating new dataset:', error);
    }
  };

  const openNewDatasetModal = () => {
    openConfirm({
      title: 'New Dataset',
      message: 'Enter the name of the new dataset:',
      type: 'info',
      confirmText: 'Create',
      inputTitle: 'Dataset Name',
      onConfirm: async (name?: string) => {
        if (!name) {
          console.error('Dataset name is required.');
          return;
        }
        try {
          const data = await apiClient.post('/api/datasets/create', { name }).then(res => res.data);
          console.log('New dataset created:', data);
          if (data.name) {
            router.push(`/datasets/${data.name}`);
          } else {
            refreshDatasets();
          }
        } catch (error) {
          console.error('Error creating new dataset:', error);
        }
      },
    });
  };

  return (
    <>
      <TopBar>
        <div>
          <h1 className="text-base sm:text-lg">Datasets</h1>
        </div>
        <div className="flex-1"></div>
        <div>
          <Button
            className="text-white bg-emerald-700 px-2 sm:px-3 py-1 rounded-md hover:bg-emerald-600 transition-colors text-sm sm:text-base whitespace-nowrap mr-2"
            onClick={() => openImportModal()}
          >
            <span className="sm:hidden">Import</span>
            <span className="hidden sm:inline">Import from LoRA Review</span>
          </Button>
          <Button
            className="text-white bg-slate-600 px-2 sm:px-3 py-1 rounded-md hover:bg-slate-500 transition-colors text-sm sm:text-base whitespace-nowrap"
            onClick={() => openNewDatasetModal()}
          >
            <span className="sm:hidden">+ New</span>
            <span className="hidden sm:inline">New Dataset</span>
          </Button>
        </div>
      </TopBar>

      <MainContent>
        <UniversalTable
          columns={columns}
          rows={tableRows}
          isLoading={status === 'loading'}
          onRefresh={refreshDatasets}
        />
      </MainContent>

      <Modal
        isOpen={isNewDatasetModalOpen}
        onClose={() => setIsNewDatasetModalOpen(false)}
        title="New Dataset"
        size="md"
      >
        <div className="space-y-4 text-gray-200">
          <form onSubmit={handleCreateDataset}>
            <div className="text-sm text-gray-400">
              This will create a new folder with the name below in your dataset folder.
            </div>
            <div className="mt-4">
              <TextInput label="Dataset Name" value={newDatasetName} onChange={value => setNewDatasetName(value)} />
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                className="rounded-md bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={() => setIsNewDatasetModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Confirm
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal
        isOpen={isImportModalOpen}
        onClose={() => !lrLoading && setIsImportModalOpen(false)}
        title="Import from LoRA Review"
        size="md"
      >
        <div className="space-y-4 text-gray-200">
          <div className="text-sm text-gray-400">
            Imports keep-status images (and merged captions) from a LoRA Dataset Review webapp into a new dataset here.
          </div>
          <TextInput label="LoRA Review URL" value={lrUrl} onChange={value => { setLrUrl(value); }} />
          <button
            type="button"
            className="rounded-md bg-gray-700 px-3 py-1 text-gray-200 hover:bg-gray-600 text-sm"
            onClick={() => openImportModal()}
          >
            Refresh list
          </button>

          {lrStatus && <div className="text-sm text-amber-300">{lrStatus}</div>}

          {lrDatasets.length > 0 && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Select dataset</label>
              <select
                className="w-full rounded-md bg-gray-800 border border-gray-600 px-3 py-2 text-gray-200"
                value={lrSelected}
                onChange={e => setLrSelected(e.target.value)}
              >
                <option value="">-- choose --</option>
                {lrDatasets.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-center space-x-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={lrIncludeCaptions}
              onChange={e => setLrIncludeCaptions(e.target.checked)}
            />
            <span>Include captions (.txt sidecars)</span>
          </label>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              className="rounded-md bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600"
              onClick={() => setIsImportModalOpen(false)}
              disabled={lrLoading}
            >
              Close
            </button>
            <button
              type="button"
              className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500 disabled:opacity-50"
              onClick={() => handleImport()}
              disabled={lrLoading || !lrSelected}
            >
              {lrLoading ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
