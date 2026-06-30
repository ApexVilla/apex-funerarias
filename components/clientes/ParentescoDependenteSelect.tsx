import React from 'react';
import { Select } from '../ui/Components';
import {
  PARENTESCO_GRUPOS,
  parentescoOpcoesPorGrupo,
  normalizarParentescoDependente,
} from '../../lib/parentescoDependente';

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  label?: string;
  error?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  placeholder?: string;
};

export const ParentescoDependenteSelect: React.FC<Props> = ({
  label = 'Parentesco *',
  value = '',
  onChange,
  placeholder = 'Selecione o parentesco',
  required,
  ...rest
}) => {
  const valorNorm = normalizarParentescoDependente(value);

  return (
    <Select
      label={label}
      value={valorNorm}
      onChange={onChange}
      required={required}
      {...rest}
    >
      <option value="">{placeholder}</option>
      {PARENTESCO_GRUPOS.map((grupo) => (
        <optgroup key={grupo.id} label={grupo.label}>
          {parentescoOpcoesPorGrupo(grupo.id).map((opcao) => (
            <option key={opcao.value} value={opcao.value}>
              {opcao.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
};
