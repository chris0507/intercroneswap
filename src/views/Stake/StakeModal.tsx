import { TokenAmount } from '@intercroneswap/v2-sdk';
import { useCallback, useContext, useState } from 'react';
import { ThemeContext } from 'styled-components';
import { Text, Button } from '@pancakeswap/uikit';
import { AutoColumn } from 'components/Layout/Column';
import NumericalInput from '../../components/NumericalInput';
import { AutoRow, RowBetween } from 'components/Layout/Row';
import TransactionConfirmationModal, { ConfirmationModalContent } from '../../components/TransactionConfirmationModal';
import { ApprovalState, useApproveCallback } from '../../hooks/useApproveCallback';
import { useWeb3React } from '@web3-react/core';
import { StakingInfo, useStakeActionHandlers, useStakeState } from '../../state/stake/hooks';
import { getStakingContract } from '../../utils';
// import { TransactionResponse } from '@ethersproject/providers';
import { useTransactionAdder } from '../../state/transactions/hooks';
import { Tabs } from '../../components/NavigationTabs';
import { MaxButton } from './styleds';
import tryParseAmount from 'utils/tryParseAmount'
import { useGasPrice } from '../../state/user/hooks';
import { calculateGasMargin } from '../../utils';

interface StakeModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  stakingAddress: string;
  balance?: TokenAmount;
  stakingInfo?: StakingInfo;
  referalAddress?: string;
}

export default function StakeModal({
  isOpen,
  onDismiss,
  stakingAddress,
  balance,
  stakingInfo,
  referalAddress,
}: StakeModalProps) {
  const { account, chainId, library } = useWeb3React();
  const gasPrice = useGasPrice();
  const theme = useContext(ThemeContext);
  const stakeState = useStakeState();

  const [isStaking, setIsStaking] = useState<boolean>(true);
  const { onUserInput } = useStakeActionHandlers();

  const [attemptingTxn, setAttemptingTxn] = useState<boolean>(false); // clicked confirm
  const [txHash, setTxHash] = useState<string>('');
  const addTransaction = useTransactionAdder();

  const stakeAmount = tryParseAmount(stakeState.typedValue, balance?.token);

  const swapStaking = () => {
    setIsStaking(!isStaking);
    onUserInput('');
  };

  const handleTypeInput = useCallback(
    (value: string) => {
      onUserInput(value);
    },
    [onUserInput],
  );

  async function doWithdraw() {
    if (!chainId || !library || !account) {
      return;
    }

    const stakingContract = getStakingContract(chainId, stakingAddress, library, account);
    if (!stakeState?.typedValue || !balance) {
      return;
    }
    const estimate = stakingContract.estimateGas.withdraw;
    const method = stakingContract.withdraw;
    const args: Array<string | string[] | number> = [stakeAmount?.raw.toString() ?? '0'];
    setAttemptingTxn(true);
    await estimate(...args, {})
      .then((estimatedGasLimit) =>
        method(...args, {
          ...{},
          gasLimit: calculateGasMargin(estimatedGasLimit),
          gasPrice,
        }).then((response) => {
          setAttemptingTxn(false);
          addTransaction(response, {
            summary: `Withdraw ${stakeState.typedValue}`,
          });
          setTxHash(response.hash);
        }),
      )
      .finally(() => {
        setTxHash('');
      })
      .catch((err) => {
        setAttemptingTxn(false);
        if (err?.code !== 4001) {
          console.error(err);
        }
      });
  }

  async function doStake() {
    if (!chainId || !library || !account) {
      return;
    }

    const stakingContract = getStakingContract(chainId, stakingAddress, library, account);
    if (!stakeState?.typedValue || !balance) {
      return;
    }
    const estimate = stakingContract.estimateGas.stake;
    const method = stakingContract.stake;
    const args: Array<string | string[] | number> = [
      stakeAmount?.raw.toString(),
      referalAddress ? referalAddress : account,
    ];
    setAttemptingTxn(true);
    await estimate(...args, {})
      .then((estimatedGasLimit) =>
        method(...args, {
          ...{},
          gasLimit: calculateGasMargin(estimatedGasLimit),
          gasPrice,
        }).then((response) => {
          setAttemptingTxn(false);
          console.log('Calling stake method');
          addTransaction(response, {
            summary: `Stake ${stakeState.typedValue}`,
          });
          setTxHash(response.hash);
        }),
      )
      .finally(() => {
        setTxHash('');
      })
      .catch((err) => {
        setAttemptingTxn(false);
        if (err?.code !== 4001) {
          console.error(err);
        }
      });
  }

  const [approveState, approveCallback] = useApproveCallback(balance, stakingAddress);

  const modalBottom = useCallback(() => {
    return (
      <AutoRow justify="center">
        {(approveState === ApprovalState.PENDING || approveState === ApprovalState.NOT_APPROVED) && (
          <Button width="50%" onClick={approveCallback}>
            Approve
          </Button>
        )}
        <Button
          width="50%"
          onClick={isStaking ? doStake : doWithdraw}
          disabled={
            isStaking
              ? Number(stakeState.typedValue) > Number(balance?.toExact())
              : Number(stakeState.typedValue) > Number(stakingInfo?.stakedAmount?.toExact())
          }
        >
          {isStaking ? 'Deposit' : 'Remove'}
        </Button>
      </AutoRow>
    );
  }, [stakeState, balance, isStaking, approveState, stakingInfo, isOpen]);

  const modalHeader = useCallback(() => {
    return (
      <AutoColumn gap="md">
        <RowBetween>
          <Text fontWeight={500}>Balance</Text>
          <Text fontWeight={500} color={theme.primary3}>
            {isStaking ? balance?.toExact() : stakingInfo?.stakedAmount?.toExact()}
          </Text>
        </RowBetween>
        <RowBetween style={{ background: theme.bg3, borderRadius: '6px' }}>
          <NumericalInput className="lp-amount-input" value={stakeState.typedValue} onUserInput={handleTypeInput} />
          <MaxButton
            style={{
              border: theme.primary3,
              borderWidth: '1px',
              borderColor: theme.primary3,
              borderStyle: 'solid',
              borderRadius: '8px',
              color: theme.primary3,
              textAlign: 'center',
              alignItems: 'center',
              overflow: 'visible',
            }}
            width="fit-content"
            onClick={() => {
              onUserInput((isStaking ? balance?.toFixed(8) : stakingInfo?.stakedAmount?.toFixed(8)) ?? '');
            }}
          >
            <Text>MAX</Text>
          </MaxButton>
        </RowBetween>
      </AutoColumn>
    );
  }, [stakeState, balance, isStaking, stakingInfo, isOpen]);

  // const toggleWalletModal = useWalletModalToggle(); // toggle wallet when disconnected
  const confirmationContent = useCallback(() => {
    return (
      <AutoRow>
        <Tabs style={{ width: '100%', margin: '8px 14px' }}>
          <Button width="48%" onClick={() => swapStaking()}>
            Stake
          </Button>
          <Button width="48%" onClick={() => swapStaking()}>
            Unstake
          </Button>
        </Tabs>
        <ConfirmationModalContent
          // title={isStaking ? 'Deposit' : 'Remove deposit'}
          // onDismiss={onDismiss}
          topContent={modalHeader}
          bottomContent={modalBottom}
        />
      </AutoRow>
    );
  }, [onDismiss, modalBottom, modalHeader, txHash]);

  const pendingText = `${isStaking ? 'Staking' : 'Withdrawing'} ${stakeState.typedValue} ${
    stakingInfo?.tokens[0].symbol
  } / ${stakingInfo?.tokens[1]?.symbol} LP Tokens`;

  return (
    <TransactionConfirmationModal
      title=""
      // isOpen={isOpen}
      onDismiss={onDismiss}
      attemptingTxn={attemptingTxn}
      hash={txHash}
      content={confirmationContent}
      pendingText={pendingText}
    />
  );
}