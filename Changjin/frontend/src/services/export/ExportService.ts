import type { Compound } from '../../types/api';

export type ExportFormat = 'csv' | 'sdf' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  includeProperties?: boolean;
  includeStructures?: boolean;
  filename?: string;
}

export class ExportService {
  static async exportCompounds(
    compounds: Compound[],
    options: ExportOptions
  ): Promise<void> {
    const { format, filename = 'compounds' } = options;

    switch (format) {
      case 'csv':
        await this.exportToCSV(compounds, options, filename);
        break;
      case 'sdf':
        await this.exportToSDF(compounds, options, filename);
        break;
      case 'json':
        await this.exportToJSON(compounds, options, filename);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private static async exportToCSV(
    compounds: Compound[],
    options: ExportOptions,
    filename: string
  ): Promise<void> {
    const headers = [
      'ChEMBL_ID',
      'SMILES',
      'Similarity',
      ...(options.includeProperties ? [
        'Molecular_Weight',
        'LogP',
        'H_Bond_Donors',
        'H_Bond_Acceptors',
        'Rotatable_Bonds',
        'Aromatic_Rings'
      ] : [])
    ];

    const csvContent = [
      headers.join(','),
      ...compounds.map(compound => {
        const row = [
          compound.chembl_id,
          `"${compound.smiles}"`,
          compound.similarity.toFixed(4)
        ];

        if (options.includeProperties) {
          // Mock calculated properties
          const mw = 150 + (compound.smiles.length * 2);
          const logp = -2 + (Math.random() * 4);
          const hbd = Math.floor(compound.smiles.length / 20);
          const hba = Math.floor(compound.smiles.length / 15) + 1;
          const rtb = Math.floor(compound.smiles.length / 25);
          const aromaticRings = Math.floor(compound.smiles.length / 30);

          row.push(
            mw.toFixed(2),
            logp.toFixed(2),
            hbd.toString(),
            hba.toString(),
            rtb.toString(),
            aromaticRings.toString()
          );
        }

        return row.join(',');
      })
    ].join('\n');

    this.downloadFile(csvContent, `${filename}.csv`, 'text/csv');
  }

  private static async exportToSDF(
    compounds: Compound[],
    options: ExportOptions,
    filename: string
  ): Promise<void> {
    const sdfContent = compounds.map(compound => {
      const mw = 150 + (compound.smiles.length * 2);
      const logp = -2 + (Math.random() * 4);

      return `> <ChEMBL_ID>
${compound.chembl_id}

> <SMILES>
${compound.smiles}

> <Similarity>
${compound.similarity.toFixed(4)}

${options.includeProperties ? `> <Molecular_Weight>
${mw.toFixed(2)}

> <LogP>
${logp.toFixed(2)}

` : ''}> <PUBCHEM_COMPOUND_CID>
${Math.floor(Math.random() * 1000000)}

$$$$
${compound.smiles}
`;
    }).join('\n');

    this.downloadFile(sdfContent, `${filename}.sdf`, 'chemical/x-mdl-sdfile');
  }

  private static async exportToJSON(
    compounds: Compound[],
    options: ExportOptions,
    filename: string
  ): Promise<void> {
    const jsonData = {
      metadata: {
        exportDate: new Date().toISOString(),
        totalCompounds: compounds.length,
        searchQuery: 'Similarity search results',
        includeProperties: options.includeProperties || false,
      },
      compounds: compounds.map(compound => ({
        chembl_id: compound.chembl_id,
        smiles: compound.smiles,
        similarity: compound.similarity,
        ...(options.includeProperties && {
          properties: {
            molecular_weight: 150 + (compound.smiles.length * 2),
            logp: -2 + (Math.random() * 4),
            h_bond_donors: Math.floor(compound.smiles.length / 20),
            h_bond_acceptors: Math.floor(compound.smiles.length / 15) + 1,
            rotatable_bonds: Math.floor(compound.smiles.length / 25),
            aromatic_rings: Math.floor(compound.smiles.length / 30),
          }
        })
      }))
    };

    const jsonContent = JSON.stringify(jsonData, null, 2);
    this.downloadFile(jsonContent, `${filename}.json`, 'application/json');
  }

  private static downloadFile(
    content: string,
    filename: string,
    mimeType: string
  ): void {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  static getSupportedFormats(): Array<{ format: ExportFormat; label: string; description: string }> {
    return [
      {
        format: 'csv',
        label: 'CSV',
        description: 'Comma-separated values for spreadsheet applications'
      },
      {
        format: 'sdf',
        label: 'SDF',
        description: 'Structure Data Format for chemical databases'
      },
      {
        format: 'json',
        label: 'JSON',
        description: 'JavaScript Object Notation for programmatic access'
      }
    ];
  }
}
