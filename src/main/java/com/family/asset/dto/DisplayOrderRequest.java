package com.family.asset.dto;

import jakarta.validation.constraints.*;
import java.util.List;

/** 정렬 화면이 조회한 전체 ID와 새 순서를 전달한다. 누락/중복/다른 유형 혼입을 거부한다. */
public record DisplayOrderRequest(@NotEmpty @Size(max = 10000) List<@NotNull @Positive Long> ids) {}
