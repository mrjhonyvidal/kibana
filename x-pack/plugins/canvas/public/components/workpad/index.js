/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useContext, useCallback } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { pure, compose, withState, withProps, getContext, withHandlers } from 'recompose';
import useObservable from 'react-use/lib/useObservable';
import { transitionsRegistry } from '../../lib/transitions_registry';
import { fetchAllRenderables } from '../../state/actions/elements';
import { setZoomScale } from '../../state/actions/transient';
import { getFullscreen, getZoomScale } from '../../state/selectors/app';
import {
  getSelectedPageIndex,
  getAllElements,
  getWorkpad,
  getPages,
} from '../../state/selectors/workpad';
import { zoomHandlerCreators } from '../../lib/app_handler_creators';
import { trackCanvasUiMetric, METRIC_TYPE } from '../../lib/ui_metric';
import { LAUNCHED_FULLSCREEN, LAUNCHED_FULLSCREEN_AUTOPLAY } from '../../../common/lib/constants';
import { WorkpadRoutingContext } from '../../routes/workpad';
import { usePlatformService } from '../../services';
import { Workpad as WorkpadComponent } from './workpad';

const mapStateToProps = (state) => {
  const { width, height, id: workpadId, css: workpadCss } = getWorkpad(state);
  return {
    pages: getPages(state),
    selectedPageNumber: getSelectedPageIndex(state) + 1,
    totalElementCount: getAllElements(state).length,
    width,
    height,
    workpadCss,
    workpadId,
    isFullscreen: getFullscreen(state),
    zoomScale: getZoomScale(state),
  };
};

const mapDispatchToProps = {
  fetchAllRenderables,
  setZoomScale,
};

const mergeProps = (stateProps, dispatchProps, ownProps) => {
  return {
    ...ownProps,
    ...stateProps,
    ...dispatchProps,
  };
};

const AddContexts = (props) => {
  const { isFullscreen, setFullscreen, undo, redo, autoplayInterval } =
    useContext(WorkpadRoutingContext);

  const platformService = usePlatformService();

  const hasHeaderBanner = useObservable(platformService.hasHeaderBanner$());

  const setFullscreenWithEffect = useCallback(
    (fullscreen) => {
      setFullscreen(fullscreen);
      if (fullscreen === true) {
        trackCanvasUiMetric(
          METRIC_TYPE.COUNT,
          autoplayInterval > 0
            ? [LAUNCHED_FULLSCREEN, LAUNCHED_FULLSCREEN_AUTOPLAY]
            : LAUNCHED_FULLSCREEN
        );
      }
    },
    [setFullscreen, autoplayInterval]
  );

  return (
    <WorkpadComponent
      {...props}
      setFullscreen={setFullscreenWithEffect}
      isFullscreen={isFullscreen}
      undoHistory={undo}
      redoHistory={redo}
      hasHeaderBanner={hasHeaderBanner}
    />
  );
};

export const Workpad = compose(
  pure,
  getContext({
    router: PropTypes.object,
  }),
  withState('grid', 'setGrid', false),
  connect(mapStateToProps, mapDispatchToProps, mergeProps),
  withState('transition', 'setTransition', null),
  withState('prevSelectedPageNumber', 'setPrevSelectedPageNumber', 0),
  withProps(({ selectedPageNumber, prevSelectedPageNumber, transition }) => {
    function getAnimation(pageNumber) {
      if (!transition || !transition.name) {
        return null;
      }
      if (![selectedPageNumber, prevSelectedPageNumber].includes(pageNumber)) {
        return null;
      }
      const { enter, exit } = transitionsRegistry.get(transition.name);
      const laterPageNumber = Math.max(selectedPageNumber, prevSelectedPageNumber);
      const name = pageNumber === laterPageNumber ? enter : exit;
      const direction = prevSelectedPageNumber > selectedPageNumber ? 'reverse' : 'normal';
      return { name, direction };
    }

    return { getAnimation };
  }),
  withHandlers({
    onPageChange: (props) => (pageNumber) => {
      if (pageNumber === props.selectedPageNumber) {
        return;
      }
      props.setPrevSelectedPageNumber(props.selectedPageNumber);
      const transitionPage = Math.max(props.selectedPageNumber, pageNumber) - 1;
      const { transition } = props.pages[transitionPage];
      if (transition) {
        props.setTransition(transition);
      }
      props.router.navigateTo('loadWorkpad', { id: props.workpadId, page: pageNumber });
    },
  }),
  withHandlers({
    onTransitionEnd:
      ({ setTransition }) =>
      () =>
        setTransition(null),
    nextPage: (props) => () => {
      const pageNumber = Math.min(props.selectedPageNumber + 1, props.pages.length);
      props.onPageChange(pageNumber);
    },
    previousPage: (props) => () => {
      const pageNumber = Math.max(1, props.selectedPageNumber - 1);
      props.onPageChange(pageNumber);
    },
  }),
  withHandlers(zoomHandlerCreators)
)(AddContexts);
