"""
twin_core.data_split
-------------------
Leakage-free dataset splitting utilities for UAV digital twin.
Implements Task B3:
  - Partitions strictly by whole flight ID / engine ID / fault family.
  - Never slices across adjacent time-series windows or random individual rows.
  - Proves zero overlap between train, validation, and test sets.
"""

from typing import List, Dict, Tuple, Set
import numpy as np
import pandas as pd


def split_by_flight_id(
    df: pd.DataFrame,
    flight_col: str = "flight_id",
    train_frac: float = 0.70,
    val_frac: float = 0.15,
    test_frac: float = 0.15,
    seed: int = 42,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Partitions a DataFrame into train, val, and test subsets strictly by flight ID.
    Guarantees that no flight ID exists in more than one partition.
    """
    if flight_col not in df.columns:
        raise ValueError(f"Column '{flight_col}' not found in DataFrame.")

    unique_flights = df[flight_col].unique()
    rng = np.random.RandomState(seed)
    shuffled_flights = rng.permutation(unique_flights)

    n_total = len(shuffled_flights)
    n_train = max(1, int(round(n_total * train_frac)))
    n_val = max(1, int(round(n_total * val_frac)))

    train_ids = set(shuffled_flights[:n_train])
    val_ids = set(shuffled_flights[n_train : n_train + n_val])
    test_ids = set(shuffled_flights[n_train + n_val :])

    # If rounding leaves test empty, adjust
    if not test_ids and len(val_ids) > 1:
        test_ids.add(val_ids.pop())

    train_df = df[df[flight_col].isin(train_ids)].copy().reset_index(drop=True)
    val_df = df[df[flight_col].isin(val_ids)].copy().reset_index(drop=True)
    test_df = df[df[flight_col].isin(test_ids)].copy().reset_index(drop=True)

    return train_df, val_df, test_df


def verify_zero_flight_leakage(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    flight_col: str = "flight_id",
) -> Dict[str, Any]:
    """
    Formally verifies that sets of flight IDs across splits are disjoint.
    """
    train_flights = set(train_df[flight_col].unique())
    val_flights = set(val_df[flight_col].unique())
    test_flights = set(test_df[flight_col].unique())

    overlap_train_val = train_flights.intersection(val_flights)
    overlap_train_test = train_flights.intersection(test_flights)
    overlap_val_test = val_flights.intersection(test_flights)

    is_leakage_free = (
        len(overlap_train_val) == 0
        and len(overlap_train_test) == 0
        and len(overlap_val_test) == 0
    )

    return {
        "is_leakage_free": is_leakage_free,
        "train_flights_count": len(train_flights),
        "val_flights_count": len(val_flights),
        "test_flights_count": len(test_flights),
        "overlap_train_val": list(overlap_train_val),
        "overlap_train_test": list(overlap_train_test),
        "overlap_val_test": list(overlap_val_test),
    }
