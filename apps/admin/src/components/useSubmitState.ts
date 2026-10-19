import { useCallback, useState } from 'react';
import { ApiRequestError } from '../api/client';

/**
 * 表单三态的统一实现（AGENTS.md §3「表单必须处理三态」）：
 * - saving：`isSaving` 为 true，页面据此禁用提交按钮并展示「保存中…」；
 * - success：给出明确成功文案；
 * - failure：展示字段级错误（`fieldErrors`）与整体说明，**不清空用户输入**（组件不持有值，值由页面 state 保留）。
 */
export type SubmitStatus = 'idle' | 'saving' | 'success' | 'error';

export type SubmitState = {
  status: SubmitStatus;
  message: string | null;
  fieldErrors: Record<string, string>;
  isSaving: boolean;
};

const INITIAL: SubmitState = { status: 'idle', message: null, fieldErrors: {}, isSaving: false };

export type SubmitController = SubmitState & {
  /** 执行一次提交；返回是否成功，便于调用方决定是否收起表单。 */
  run: (task: () => Promise<string | void>, successMessage?: string) => Promise<boolean>;
  reset: () => void;
};

export function useSubmitState(): SubmitController {
  const [state, setState] = useState<SubmitState>(INITIAL);

  const run = useCallback(async (task: () => Promise<string | void>, successMessage = '已保存') => {
    setState({ status: 'saving', message: null, fieldErrors: {}, isSaving: true });
    try {
      const result = await task();
      setState({
        status: 'success',
        message: typeof result === 'string' ? result : successMessage,
        fieldErrors: {},
        isSaving: false,
      });
      return true;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setState({
          status: 'error',
          message: error.message,
          fieldErrors: error.fields,
          isSaving: false,
        });
      } else {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '发生未知错误',
          fieldErrors: {},
          isSaving: false,
        });
      }
      return false;
    }
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  return { ...state, run, reset };
}
