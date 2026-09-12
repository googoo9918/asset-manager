package com.family.asset.kis;

import com.family.asset.dto.*;
import java.math.BigDecimal;
import java.util.List;

/** Provider-neutral authoritative state. Trades never adjust an already included API balance. */
public record BrokerState(
    BigDecimal depositKrw,
    BigDecimal depositUsd,
    BigDecimal exchangeRate,
    List<Holding> holdings,
    List<SecurityTrade> trades) {}
